using System.Collections.Concurrent;
using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Steps;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using Xunit;

namespace CulinaryBlog.Steps.Tests;

public sealed class StepApiTests : IAsyncLifetime
{
    private WebApplication app = null!;
    private HttpClient client = null!;
    private readonly Guid recipeId = Guid.NewGuid();
    private readonly Guid categoryId = Guid.NewGuid();
    private readonly RecordingCache cache = new();
    private readonly CommitAckFailure commitAck = new();
    private string Route => $"/api/v1/recipes/{recipeId}/steps";
    private ApplicationDbContext Db(IServiceScope scope) => scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

    public async Task InitializeAsync()
    {
        var configured = Environment.GetEnvironmentVariable("STEPS_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set STEPS_TEST_CONNECTION; only a new fr_rcp010_test_<guid> database is modified.");
        var connection = new NpgsqlConnectionStringBuilder(configured) { Database = "fr_rcp010_test_" + Guid.NewGuid().ToString("N") };
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer(); builder.Logging.ClearProviders();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["ConnectionStrings:DefaultConnection"] = connection.ConnectionString,
            ["Minio:AccessKey"] = "test-unused", ["Minio:SecretKey"] = "test-unused" });
        builder.Services.AddApplication(); builder.Services.AddInfrastructure(builder.Configuration);
        builder.Services.AddDbContext<ApplicationDbContext>(options => options.AddInterceptors(commitAck));
        builder.Services.AddSingleton<IRecipeCacheInvalidator>(cache);
        builder.Services.AddRecipeApiConfiguration();
        builder.Services.AddAuthentication("StepsTest").AddScheme<AuthenticationSchemeOptions, TestAuthentication>("StepsTest", _ => { });
        builder.Services.AddRateLimiter(options => options.AddConcurrencyLimiter("upload", limiter => limiter.PermitLimit = 10));
        app = builder.Build();
        app.UseMiddleware<GlobalExceptionMiddleware>(); app.UseRouting(); app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
        var api = app.MapGroup("/api/v1"); api.MapRecipeEndpoints(); api.MapRecipeStepEndpoints(); api.MapRecipeIngredientEndpoints();
        using var scope = app.Services.CreateScope(); var db = Db(scope);
        await db.Database.MigrateAsync();
        var category = Category.Create("Steps test", "steps-test"); category.Id = categoryId;
        var recipe = NewRecipe("steps-test"); recipe.Id = recipeId;
        db.AddRange(new ApplicationUser { Id = "owner", DisplayName = "Steps test owner" }, category, recipe);
        await db.SaveChangesAsync();
        await app.StartAsync(); client = app.GetTestClient(); User("owner");
    }
    private Recipe NewRecipe(string slug) => Recipe.Create(slug, slug, "description", "legacy instructions", 1, 1, 2, RecipeDifficulty.Easy, categoryId, "owner");
    public async Task DisposeAsync()
    {
        client?.Dispose();
        if (app is null) return;
        using (var scope = app.Services.CreateScope()) await Db(scope).Database.EnsureDeletedAsync();
        await app.DisposeAsync();
    }
    private void User(string? id)
    { client.DefaultRequestHeaders.Remove("X-Test-User"); if (id is not null) client.DefaultRequestHeaders.Add("X-Test-User", id); }
    private async Task<(List<StepDto> Items, string Etag)> Read()
    {
        var result = await client.GetAsync(Route); result.EnsureSuccessStatusCode();
        Assert.Equal("no-store", result.Headers.CacheControl!.ToString());
        return ((await result.Content.ReadFromJsonAsync<ApiResponse<List<StepDto>>>())!.Data!, result.Headers.ETag!.ToString());
    }
    private Task<HttpResponseMessage> Write(HttpMethod method, string route, object? body, string? version)
    {
        var request = new HttpRequestMessage(method, route);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (version is not null) request.Headers.TryAddWithoutValidation("If-Match", version);
        return client.SendAsync(request);
    }
    private async Task<StepDto> Add(string text = "Trộn", string? title = null)
    {
        var state = await Read();
        var result = await Write(HttpMethod.Post, Route, new { description = text, title }, state.Etag);
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        Assert.NotNull(result.Headers.ETag);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(result.Headers.Location)).StatusCode);
        return (await result.Content.ReadFromJsonAsync<ApiResponse<StepDto>>())!.Data!;
    }

    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("reader", HttpStatusCode.Forbidden)]
    [InlineData("other", HttpStatusCode.Forbidden)]
    public async Task Authorization_protects_reads_and_writes(string? user, HttpStatusCode expected)
    {
        var state = await Read(); User(user);
        Assert.Equal(expected, (await client.GetAsync(Route)).StatusCode);
        Assert.Equal(expected, (await Write(HttpMethod.Post, Route, new { description = "Trộn" }, state.Etag)).StatusCode);
        Assert.Empty(cache.Calls);
    }

    [Fact]
    public async Task Crud_reorder_soft_delete_and_public_aliases_remain_consistent()
    {
        var first = await Add(" Trộn "); var second = await Add("Nấu", "Tiêu đề riêng"); var third = await Add("Dọn");
        Assert.Equal("Bước 1", first.Title); Assert.Equal("Trộn", first.Description);
        var state = await Read();
        var changed = await Write(HttpMethod.Put, $"{Route}/{second.Id}", new { title = "  Sơ chế  ", description = "  Rửa  ", timerMinutes = 0, imageUrl = "https://images.unsplash.com/test.jpg" }, state.Etag);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.NotEqual(state.Etag, changed.Headers.ETag!.ToString());
        state = await Read();
        Assert.Equal(2, state.Items[1].StepNumber); Assert.Equal(0, state.Items[1].TimerMinutes);
        var reorder = await Write(HttpMethod.Put, Route + "/reorder", new { stepIds = new[] { third.Id, second.Id, first.Id } }, state.Etag);
        Assert.Equal(HttpStatusCode.OK, reorder.StatusCode);
        state = await Read(); Assert.Equal(new[] { third.Id, second.Id, first.Id }, state.Items.Select(s => s.Id));
        Assert.Equal(new[] { 1, 2, 3 }, state.Items.Select(s => s.StepNumber));
        var deletion = await Write(HttpMethod.Delete, $"{Route}/{second.Id}", null, state.Etag);
        Assert.Equal(HttpStatusCode.NoContent, deletion.StatusCode); Assert.NotNull(deletion.Headers.ETag);
        state = await Read(); Assert.Equal(new[] { 1, 2 }, state.Items.Select(s => s.StepNumber));
        Assert.Equal(HttpStatusCode.NotFound, (await Write(HttpMethod.Delete, $"{Route}/{second.Id}", null, state.Etag)).StatusCode);
        using var scope = app.Services.CreateScope(); var db = Db(scope);
        Assert.True((await db.RecipeSteps.IgnoreQueryFilters().SingleAsync(s => s.Id == second.Id)).IsDeleted);
        Assert.Equal("legacy instructions", (await db.Recipes.SingleAsync()).Instructions);
        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/v1/recipes/by-id/{recipeId}");
        var publicSteps = detail.GetProperty("data").GetProperty("steps").EnumerateArray().ToArray();
        Assert.Equal(2, publicSteps.Length); Assert.Equal(1, publicSteps[0].GetProperty("order").GetInt32());
        Assert.Equal("Dọn", publicSteps[0].GetProperty("text").GetString());
        Assert.True(cache.Calls.Count >= 6);
    }

    [Theory]
    [InlineData("{\"description\":\" \"}")]
    [InlineData("{\"description\":\"OK\",\"timerMinutes\":-1}")]
    [InlineData("{\"description\":\"OK\",\"timerMinutes\":1.5}")]
    [InlineData("{\"description\":\"OK\",\"timerMinutes\":2147483648}")]
    [InlineData("{\"description\":\"OK\",\"imageUrl\":\"javascript:alert(1)\"}")]
    [InlineData("{\"description\":\"OK\",\"stepNumber\":9}")]
    [InlineData("{\"description\":\"OK\",\"description\":\"duplicate\"}")]
    public async Task Invalid_payload_returns_422_without_partial_write(string json)
    {
        var state = await Read();
        using var request = new HttpRequestMessage(HttpMethod.Post, Route) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
        request.Headers.TryAddWithoutValidation("If-Match", state.Etag);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.SendAsync(request)).StatusCode);
        Assert.Equal(state.Etag, (await Read()).Etag); Assert.Empty(cache.Calls);
    }

    [Fact]
    public async Task Version_foreign_ids_and_reorder_validation_are_atomic()
    {
        var state = await Read();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(HttpMethod.Post, Route, new { description = "OK" }, null)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(HttpMethod.Post, Route, new { description = "OK" }, "W/" + state.Etag)).StatusCode);
        var first = await Add(); var second = await Add();
        Assert.Equal(HttpStatusCode.Conflict, (await Write(HttpMethod.Put, $"{Route}/{first.Id}", new { description = "Stale" }, state.Etag)).StatusCode);
        state = await Read();
        foreach (var ids in new[] { Array.Empty<Guid>(), new[] { first.Id, first.Id }, new[] { first.Id, Guid.NewGuid() } })
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(HttpMethod.Put, Route + "/reorder", new { stepIds = ids }, state.Etag)).StatusCode);
        using (var scope = app.Services.CreateScope())
        {
            var db = Db(scope); var foreign = NewRecipe("foreign"); db.Add(foreign);
            db.Add(RecipeStep.Create(foreign.Id, 1, "Other", "Other")); await db.SaveChangesAsync();
            var foreignId = await db.RecipeSteps.Where(s => s.RecipeId == foreign.Id).Select(s => s.Id).SingleAsync();
            Assert.Equal(HttpStatusCode.NotFound, (await Write(HttpMethod.Delete, $"{Route}/{foreignId}", null, state.Etag)).StatusCode);
        }
        Assert.Equal(state.Etag, (await Read()).Etag);
        Assert.Equal(new[] { first.Id, second.Id }, (await Read()).Items.Select(s => s.Id));
    }

    [Fact]
    public async Task Admin_and_deleted_category_work_but_deleted_recipe_is_inaccessible()
    {
        User("admin"); await Add();
        using var scope = app.Services.CreateScope(); var db = Db(scope);
        await db.Categories.ExecuteUpdateAsync(s => s.SetProperty(c => c.IsDeleted, true));
        User("owner"); await Add();
        await db.Recipes.ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDeleted, true));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Route)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Write(HttpMethod.Post, Route, new { description = "Denied" }, '"' + Convert.ToBase64String(new byte[16]) + '"')).StatusCode);
    }

    [Fact]
    public async Task Concurrent_appends_and_cross_child_versions_do_not_lose_updates()
    {
        var state = await Read();
        var replies = await Task.WhenAll(Write(HttpMethod.Post, Route, new { description = "A" }, state.Etag), Write(HttpMethod.Post, Route, new { description = "B" }, state.Etag));
        Assert.Single(replies, r => r.StatusCode == HttpStatusCode.Created); Assert.Single(replies, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Single((await Read()).Items);
        var ingredient = await Write(HttpMethod.Post, $"/api/v1/recipes/{recipeId}/ingredients", new { name = "Muối" }, state.Etag);
        Assert.Equal(HttpStatusCode.Conflict, ingredient.StatusCode);
    }

    [Fact]
    public async Task Published_last_step_is_protected_and_empty_draft_or_archive_is_allowed()
    {
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PatchAsync($"/api/v1/recipes/{recipeId}/publish", null)).StatusCode);
        var step = await Add();
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsync($"/api/v1/recipes/{recipeId}/publish", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsync($"/api/v1/recipes/{recipeId}/publish", null)).StatusCode);
        var state = await Read();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(HttpMethod.Delete, $"{Route}/{step.Id}", null, state.Etag)).StatusCode);
        Assert.Equal(state.Etag, (await Read()).Etag);
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsync($"/api/v1/recipes/{recipeId}/unpublish", null)).StatusCode);
        state = await Read();
        Assert.Equal(HttpStatusCode.NoContent, (await Write(HttpMethod.Delete, $"{Route}/{step.Id}", null, state.Etag)).StatusCode);
        await client.PatchAsync($"/api/v1/recipes/{recipeId}/archive", null);
        step = await Add(); state = await Read();
        Assert.Equal(HttpStatusCode.NoContent, (await Write(HttpMethod.Delete, $"{Route}/{step.Id}", null, state.Etag)).StatusCode);
    }

    [Fact]
    public async Task Gallery_mutation_rotates_the_same_recipe_version_used_by_steps()
    {
        Guid imageId;
        using (var scope = app.Services.CreateScope())
        {
            var image = RecipeImage.Create(recipeId, "https://images.unsplash.com/test.jpg", isPrimary: true);
            imageId = image.Id; Db(scope).Add(image); await Db(scope).SaveChangesAsync();
        }
        var state = await Read();
        Assert.Equal(HttpStatusCode.OK, (await client.PatchAsync($"/api/v1/recipes/{recipeId}/images/{imageId}/primary", null)).StatusCode);
        Assert.NotEqual(state.Etag, (await Read()).Etag);
        Assert.Equal(HttpStatusCode.Conflict, (await Write(HttpMethod.Post, Route, new { description = "Stale after gallery" }, state.Etag)).StatusCode);
    }

    [Fact]
    public async Task Publish_racing_last_delete_never_commits_published_without_steps()
    {
        var step = await Add(); var state = await Read();
        var results = await Task.WhenAll(client.PatchAsync($"/api/v1/recipes/{recipeId}/publish", null), Write(HttpMethod.Delete, $"{Route}/{step.Id}", null, state.Etag));
        Assert.All(results, result => Assert.Contains(result.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.NoContent, HttpStatusCode.Conflict, HttpStatusCode.UnprocessableEntity }));
        using var scope = app.Services.CreateScope(); var db = Db(scope);
        var recipe = await db.Recipes.Include(r => r.Steps).SingleAsync();
        Assert.True(recipe.Status != RecipeStatus.Published || recipe.Steps.Count > 0);
    }

    [Fact]
    public async Task Reorder_phase_two_failure_rolls_back_every_number_and_version()
    {
        var a = await Add("A"); var b = await Add("B"); var state = await Read();
        using var scope = app.Services.CreateScope(); var db = Db(scope);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION fail_final_step_number() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF OLD."StepNumber" > 2 AND NEW."StepNumber" <= 2 THEN RAISE EXCEPTION 'simulated phase two failure'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER fail_step_number BEFORE UPDATE ON "RecipeSteps" FOR EACH ROW EXECUTE FUNCTION fail_final_step_number();
            """);
        var failed = await Write(HttpMethod.Put, Route + "/reorder", new { stepIds = new[] { b.Id, a.Id } }, state.Etag);
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
        var after = await Read(); Assert.Equal(state.Etag, after.Etag); Assert.Equal(state.Items, after.Items);
        await db.Database.ExecuteSqlRawAsync("DROP TRIGGER fail_step_number ON \"RecipeSteps\"; DROP FUNCTION fail_final_step_number();");
        Assert.Equal(HttpStatusCode.OK, (await Write(HttpMethod.Put, Route + "/reorder", new { stepIds = new[] { b.Id, a.Id } }, state.Etag)).StatusCode);
    }

    [Fact]
    public async Task Lost_commit_ack_retry_does_not_append_twice()
    {
        var state = await Read(); commitAck.Armed = true;
        var result = await Write(HttpMethod.Post, Route, new { description = "Only once" }, state.Etag);
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        Assert.True(commitAck.Fired); Assert.Single((await Read()).Items); Assert.Single(cache.Calls);
    }

    [Fact]
    public async Task Nested_create_validates_all_fields_and_preserves_image_timer_and_empty_draft()
    {
        object Payload(object[] steps) => new { title = "New steps recipe", categoryId, servings = 1, prepTime = 0, cookTime = 0, difficulty = 1, steps };
        var invalid = await client.PostAsJsonAsync("/api/v1/recipes", Payload([new { description = "OK" }, new { description = "Bad", timerMinutes = -1 }]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalid.StatusCode);
        using var scope = app.Services.CreateScope(); Assert.Equal(1, await Db(scope).Recipes.CountAsync());
        var valid = await client.PostAsJsonAsync("/api/v1/recipes", Payload([new { description = "Trộn", title = "", timerMinutes = 0, imageUrl = "https://images.unsplash.com/test.jpg" }]));
        Assert.Equal(HttpStatusCode.Created, valid.StatusCode);
        var saved = await Db(scope).RecipeSteps.SingleAsync(); Assert.Equal("Bước 1", saved.Title); Assert.Equal(0, saved.TimerMinutes); Assert.NotNull(saved.ImageUrl);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/recipes", Payload([]))).StatusCode);
    }

    [Fact]
    public async Task Migration_normalizes_legacy_rows_and_enforces_unique_active_only()
    {
        using var scope = app.Services.CreateScope(); var db = Db(scope); var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261016025646_AddWelcomeEmailDeliveries");
        var rows = new[] { RecipeStep.Create(recipeId, -1, "Title A", "Keep A"), RecipeStep.Create(recipeId, 4, "Title B", "Keep B"), RecipeStep.Create(recipeId, 4, "Title C", "Keep C") };
        var deleted = RecipeStep.Create(recipeId, 1, "Deleted", "Keep deleted"); deleted.IsDeleted = true;
        db.AddRange(rows); db.Add(deleted); await db.SaveChangesAsync();
        var before = (await db.Recipes.SingleAsync()).RowVersion.ToArray();
        var expectedIds = rows.OrderBy(s => s.StepNumber).ThenBy(s => s.CreatedAt).ThenBy(s => s.Id).Select(s => s.Id).ToArray();
        await migrator.MigrateAsync(); db.ChangeTracker.Clear();
        var current = await db.RecipeSteps.OrderBy(s => s.StepNumber).ToListAsync();
        Assert.Equal(expectedIds, current.Select(s => s.Id)); Assert.Equal(new[] { 1, 2, 3 }, current.Select(s => s.StepNumber));
        Assert.All(current, s => Assert.StartsWith("Keep", s.Description));
        var afterVersion = (await db.Recipes.SingleAsync()).RowVersion;
        Assert.False(before.SequenceEqual(afterVersion));
        Assert.Equal(1, (await db.RecipeSteps.IgnoreQueryFilters().SingleAsync(s => s.Id == deleted.Id)).StepNumber);
        db.Add(RecipeStep.Create(recipeId, 1, "Duplicate", "Rejected"));
        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal(PostgresErrorCodes.UniqueViolation, Assert.IsType<PostgresException>(exception.InnerException).SqlState);
    }

    [Fact]
    public async Task Maximum_count_rejects_append_without_rotating_version()
    {
        using (var scope = app.Services.CreateScope())
        {
            var db = Db(scope);
            db.AddRange(Enumerable.Range(1, 100).Select(number => RecipeStep.Create(recipeId, number, $"Bước {number}", "Nội dung")));
            await db.SaveChangesAsync();
        }
        var before = await Read();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(HttpMethod.Post, Route, new { description = "Too many" }, before.Etag)).StatusCode);
        var after = await Read(); Assert.Equal(100, after.Items.Count); Assert.Equal(before.Etag, after.Etag); Assert.Empty(cache.Calls);
    }

    [Fact]
    public async Task Recipe_delete_racing_child_write_cannot_resurrect_deleted_recipe()
    {
        var step = await Add(); var state = await Read();
        var results = await Task.WhenAll(client.DeleteAsync($"/api/v1/recipes/{recipeId}"),
            Write(HttpMethod.Put, $"{Route}/{step.Id}", new { description = "Concurrent child" }, state.Etag));
        Assert.All(results, result => Assert.Contains(result.StatusCode,
            new[] { HttpStatusCode.OK, HttpStatusCode.NoContent, HttpStatusCode.Conflict, HttpStatusCode.NotFound }));
        using var scope = app.Services.CreateScope(); var db = Db(scope);
        var recipe = await db.Recipes.IgnoreQueryFilters().SingleAsync();
        if (recipe.IsDeleted) Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Route)).StatusCode);
        else Assert.Equal(HttpStatusCode.Conflict, results[0].StatusCode);
    }

    private sealed class RecordingCache : IRecipeCacheInvalidator
    {
        public ConcurrentBag<Guid> Calls { get; } = [];
        public Task InvalidateRecipeAsync(Guid recipeId, string? slug, CancellationToken cancellationToken = default) { Calls.Add(recipeId); return Task.CompletedTask; }
    }
    private sealed class CommitAckFailure : DbTransactionInterceptor
    {
        public bool Armed { get; set; }
        public bool Fired { get; private set; }
        public override Task TransactionCommittedAsync(DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
        {
            if (Armed) { Armed = false; Fired = true; throw new PostgresException("Simulated lost commit ACK", "ERROR", "ERROR", PostgresErrorCodes.SerializationFailure); }
            return Task.CompletedTask;
        }
    }
    private sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var id = Request.Headers["X-Test-User"].ToString(); if (id == "") return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id), new Claim(ClaimTypes.Role, id == "admin" ? "Admin" : id == "reader" ? "Reader" : "Author")], Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
