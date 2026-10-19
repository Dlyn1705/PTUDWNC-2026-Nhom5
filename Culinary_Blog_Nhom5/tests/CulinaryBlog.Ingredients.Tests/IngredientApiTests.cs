using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Features.Recipes.Ingredients;
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
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using Xunit;

namespace CulinaryBlog.Ingredients.Tests;

public sealed class IngredientApiTests : IAsyncLifetime
{
    private WebApplication app = null!;
    private HttpClient client = null!;
    private readonly Guid recipeId = Guid.NewGuid();
    private readonly Guid categoryId = Guid.NewGuid();
    private string Route => $"/api/v1/recipes/{recipeId}/ingredients";

    public async Task InitializeAsync()
    {
        var configured = Environment.GetEnvironmentVariable("INGREDIENTS_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set INGREDIENTS_TEST_CONNECTION to a local PostgreSQL connection with CREATE DATABASE permission.");
        var connection = new NpgsqlConnectionStringBuilder(configured) { Database = "fr_rcp009_test_" + Guid.NewGuid().ToString("N") };
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = connection.ConnectionString,
            ["Minio:AccessKey"] = "unused-test", ["Minio:SecretKey"] = "unused-test"
        });
        builder.Logging.ClearProviders();
        builder.Services.AddApplication(); builder.Services.AddInfrastructure(builder.Configuration);
        builder.Services.AddRecipeApiConfiguration();
        builder.Services.AddAuthentication("IngredientsTest")
            .AddScheme<AuthenticationSchemeOptions, TestAuthentication>("IngredientsTest", _ => { });
        builder.Services.AddRateLimiter(options => options.AddConcurrencyLimiter("upload", limiter => limiter.PermitLimit = 10));
        app = builder.Build();
        app.UseMiddleware<GlobalExceptionMiddleware>(); app.UseRouting();
        app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
        app.MapGroup("/api/v1").MapRecipeEndpoints();
        app.MapGroup("/api/v1").MapRecipeIngredientEndpoints();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.EnsureCreatedAsync();
        var owner = new ApplicationUser { Id = "owner", DisplayName = "Ingredient test owner" };
        var category = Category.Create("Ingredient test", "ingredient-test"); category.Id = categoryId;
        var recipe = Recipe.Create("Ingredient test", "ingredient-test", "description", "instructions", 1, 1, 2,
            RecipeDifficulty.Easy, categoryId, owner.Id); recipe.Id = recipeId;
        db.AddRange(owner, category, recipe); await db.SaveChangesAsync();
        await app.StartAsync(); client = app.GetTestClient();
    }

    public async Task DisposeAsync()
    {
        client?.Dispose();
        if (app is null) return;
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.EnsureDeletedAsync();
        await app.DisposeAsync();
    }

    private void User(string? id)
    {
        client.DefaultRequestHeaders.Remove("X-Test-User");
        if (id is not null) client.DefaultRequestHeaders.Add("X-Test-User", id);
    }

    private async Task<(List<IngredientDto> Items, string Etag)> Read()
    {
        var response = await client.GetAsync(Route); response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<ApiResponse<List<IngredientDto>>>();
        return (payload!.Data!, response.Headers.ETag!.ToString());
    }

    private Task<HttpResponseMessage> Write(HttpMethod method, string route, object? body, string? etag)
    {
        var request = new HttpRequestMessage(method, route);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (etag is not null) request.Headers.TryAddWithoutValidation("If-Match", etag);
        return client.SendAsync(request);
    }

    [Fact]
    public async Task Crud_nullable_order_and_authorization_contract()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(Route)).StatusCode);
        User("reader"); Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(Route)).StatusCode);
        User("other"); Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(Route)).StatusCode);
        User("owner"); var initial = await Read(); Assert.Empty(initial.Items);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(HttpMethod.Post, Route, new IngredientInput("Muối"), null)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(HttpMethod.Post, Route, new IngredientInput("Muối", 0), initial.Etag)).StatusCode);
        var added = await Write(HttpMethod.Post, Route, new IngredientInput(" Muối ", null, " ", " Vừa đủ "), initial.Etag);
        Assert.Equal(HttpStatusCode.Created, added.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(added.Headers.Location)).StatusCode);
        var first = Assert.Single((await Read()).Items); Assert.Null(first.Quantity); Assert.Null(first.Unit); Assert.Equal("Vừa đủ", first.Notes);
        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/v1/recipes/by-id/{recipeId}");
        var detailData = detail.GetProperty("data");
        Assert.Equal(JsonValueKind.Null, detailData.GetProperty("ingredients")[0].GetProperty("quantity").ValueKind);
        Assert.Equal(0, detailData.GetProperty("ingredients")[0].GetProperty("orderIndex").GetInt32());
        var secondAdded = await Write(HttpMethod.Post, Route, new IngredientInput("Muối", 0.001m, "g"), added.Headers.ETag!.ToString());
        Assert.Equal(HttpStatusCode.Created, secondAdded.StatusCode);
        var state = await Read(); Assert.Equal(2, state.Items.Count); var second = state.Items[1]; Assert.Equal(0.001m, second.Quantity);
        var changed = await Write(HttpMethod.Put, $"{Route}/{first.Id}", new IngredientInput("Tiêu", 1.5m, "g", "xay"), state.Etag);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        changed = await Write(HttpMethod.Put, $"{Route}/{first.Id}", new IngredientInput("Tiêu", null, null, "vừa đủ"), changed.Headers.ETag!.ToString());
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var etag = changed.Headers.ETag!.ToString();
        var invalid = await Write(HttpMethod.Put, Route + "/reorder", new { ingredientIds = new[] { first.Id, first.Id } }, etag);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalid.StatusCode); Assert.Equal(etag, (await Read()).Etag);
        var reordered = await Write(HttpMethod.Put, Route + "/reorder", new { ingredientIds = new[] { second.Id, first.Id } }, etag);
        Assert.Equal(HttpStatusCode.OK, reordered.StatusCode);
        state = await Read(); Assert.Equal(new[] { second.Id, first.Id }, state.Items.Select(x => x.Id)); Assert.Equal(new[] { 0, 1 }, state.Items.Select(x => x.OrderIndex));
        User("other"); Assert.Equal(HttpStatusCode.Forbidden, (await Write(HttpMethod.Delete, $"{Route}/{first.Id}", null, state.Etag)).StatusCode);
        User("admin"); Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(Route)).StatusCode);
        var deleted = await Write(HttpMethod.Delete, $"{Route}/{second.Id}", null, state.Etag);
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode); Assert.Equal(0, Assert.Single((await Read()).Items).OrderIndex);
        deleted = await Write(HttpMethod.Delete, $"{Route}/{first.Id}", null, deleted.Headers.ETag!.ToString());
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode); Assert.Empty((await Read()).Items);
        Assert.Equal(HttpStatusCode.NoContent, (await Write(HttpMethod.Delete, $"{Route}/{first.Id}", null, deleted.Headers.ETag!.ToString())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Write(HttpMethod.Put, $"{Route}/{Guid.NewGuid()}", new IngredientInput("X"), deleted.Headers.ETag!.ToString())).StatusCode);
    }

    [Fact]
    public async Task Concurrent_writes_reject_stale_versions_and_soft_deleted_recipes()
    {
        User("owner"); var state = await Read();
        var responses = await Task.WhenAll(Write(HttpMethod.Post, Route, new IngredientInput("A"), state.Etag),
            Write(HttpMethod.Post, Route, new IngredientInput("B"), state.Etag));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
        var current = await Read(); Assert.Single(current.Items);
        var old = await Write(HttpMethod.Put, $"/api/v1/recipes/{recipeId}", new { title = "Changed", description = "description", instructions = "instructions",
            prepTime = 1, cookTime = 1, servings = 2, difficulty = 1, categoryId, rowVersion = state.Etag.Trim('"') }, null);
        Assert.Equal(HttpStatusCode.Conflict, old.StatusCode);
        using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var recipe = await db.Recipes.SingleAsync(x => x.Id == recipeId); recipe.Status = RecipeStatus.Archived; await db.SaveChangesAsync();
        current = await Read();
        Assert.Equal(HttpStatusCode.OK, (await Write(HttpMethod.Put, $"{Route}/{current.Items[0].Id}", new IngredientInput("Archived editable"), current.Etag)).StatusCode);
        db.ChangeTracker.Clear();
        recipe = await db.Recipes.SingleAsync(x => x.Id == recipeId);
        recipe.SoftDelete(); await db.SaveChangesAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Route)).StatusCode);
    }

    [Fact]
    public async Task Nested_create_uses_same_validation_and_is_atomic()
    {
        User("owner");
        object Payload(object[] ingredients) => new { title = "Nested recipe", description = "description", instructions = "instructions",
            prepTime = 1, cookTime = 1, servings = 2, difficulty = 1, categoryId, ingredients };
        var invalid = await client.PostAsJsonAsync("/api/v1/recipes/", Payload([new IngredientInput("Valid"), new IngredientInput("Invalid", 0)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalid.StatusCode);
        using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.Equal(1, await db.Recipes.CountAsync()); Assert.Empty(await db.RecipeIngredients.ToListAsync());
        var created = await client.PostAsJsonAsync("/api/v1/recipes/", Payload([new IngredientInput("Muối", null, null, "Vừa đủ"), new IngredientInput("Gia vị", 0.001m, "g")]));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var items = await db.RecipeIngredients.OrderBy(x => x.OrderIndex).AsNoTracking().ToListAsync();
        Assert.Equal(new[] { 0, 1 }, items.Select(x => x.OrderIndex)); Assert.Null(items[0].Quantity); Assert.Equal(0.001m, items[1].Quantity);
    }

    [Fact]
    public async Task Limits_foreign_ids_and_invalid_reorder_never_partially_change_data()
    {
        User("owner");
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var foreign = Recipe.Create("Foreign", "foreign", "description", "instructions", 1, 1, 2,
            RecipeDifficulty.Easy, categoryId, "owner");
        var foreignItem = RecipeIngredient.Create(foreign.Id, "Foreign item", null, null);
        db.AddRange(foreign, foreignItem);
        // Legacy data may have one-based positions and ties. First mutation normalizes all active rows.
        for (var index = 0; index < 100; index++)
            db.RecipeIngredients.Add(RecipeIngredient.Create(recipeId, "Ingredient " + index, null, null, orderIndex: index + 1));
        await db.SaveChangesAsync();
        var state = await Read();
        var added = await Write(HttpMethod.Post, Route, new IngredientInput("Overflow"), state.Etag);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, added.StatusCode);
        Assert.Equal(state.Etag, (await Read()).Etag);
        Assert.Equal(HttpStatusCode.NotFound, (await Write(HttpMethod.Put, $"{Route}/{foreignItem.Id}", new IngredientInput("Wrong recipe"), state.Etag)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Write(HttpMethod.Delete, $"{Route}/{foreignItem.Id}", null, state.Etag)).StatusCode);
        var foreignOrder = state.Items.Select(x => x.Id).ToArray(); foreignOrder[0] = foreignItem.Id;
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(HttpMethod.Put, Route + "/reorder", new { ingredientIds = foreignOrder }, state.Etag)).StatusCode);
        Assert.Equal(state.Etag, (await Read()).Etag);
        var ids = state.Items.Select(x => x.Id).Reverse().ToArray();
        var reordered = await Write(HttpMethod.Put, Route + "/reorder", new { ingredientIds = ids }, state.Etag);
        Assert.Equal(HttpStatusCode.OK, reordered.StatusCode);
        state = await Read(); Assert.Equal(ids, state.Items.Select(x => x.Id)); Assert.Equal(Enumerable.Range(0, 100), state.Items.Select(x => x.OrderIndex));
        var beforeDelete = state.Etag;
        var deleted = await Write(HttpMethod.Delete, $"{Route}/{ids[0]}", null, beforeDelete);
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        // An outdated reorder cannot undo that deletion or partially move the remaining rows.
        Assert.Equal(HttpStatusCode.Conflict, (await Write(HttpMethod.Put, Route + "/reorder", new { ingredientIds = ids }, beforeDelete)).StatusCode);
        state = await Read(); Assert.Equal(99, state.Items.Count); Assert.Equal(Enumerable.Range(0, 99), state.Items.Select(x => x.OrderIndex));
        Assert.Equal("Foreign item", (await db.RecipeIngredients.AsNoTracking().SingleAsync(x => x.Id == foreignItem.Id)).Name);
    }

    [Fact]
    public async Task Database_failure_rolls_back_order_and_recipe_version_together()
    {
        User("owner"); var state = await Read();
        var first = await Write(HttpMethod.Post, Route, new IngredientInput("A"), state.Etag);
        await Write(HttpMethod.Post, Route, new IngredientInput("B"), first.Headers.ETag!.ToString());
        state = await Read();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION fail_recipe_write() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'simulated recipe update failure'; END $$;
            CREATE TRIGGER fail_recipe BEFORE UPDATE ON "Recipes" FOR EACH ROW EXECUTE FUNCTION fail_recipe_write();
            """);
        var order = state.Items.Select(x => x.Id).Reverse().ToArray();
        var failed = await Write(HttpMethod.Put, Route + "/reorder", new { ingredientIds = order }, state.Etag);
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
        var unchanged = await Read();
        Assert.Equal(state.Etag, unchanged.Etag);
        Assert.Equal(state.Items.Select(x => x.Id), unchanged.Items.Select(x => x.Id));
        await db.Database.ExecuteSqlRawAsync("DROP TRIGGER fail_recipe ON \"Recipes\"; DROP FUNCTION fail_recipe_write();");
        Assert.Equal(HttpStatusCode.OK, (await Write(HttpMethod.Put, Route + "/reorder", new { ingredientIds = order }, state.Etag)).StatusCode);
    }

    private sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger,
        UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var id = Request.Headers["X-Test-User"].ToString();
            if (string.IsNullOrEmpty(id)) return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id),
                new Claim(ClaimTypes.Role, id == "admin" ? "Admin" : id == "reader" ? "Reader" : "Author")], Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
