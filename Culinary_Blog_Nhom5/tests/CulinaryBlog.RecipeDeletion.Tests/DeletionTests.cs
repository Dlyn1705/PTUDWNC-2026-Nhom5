using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipe;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Minio;
using Minio.DataModel.Args;
using Npgsql;
using Xunit;

namespace CulinaryBlog.RecipeDeletion.Tests;

public sealed class DeletionTests : IAsyncLifetime
{
    private WebApplication app = null!;
    private HttpClient client = null!;
    private readonly RecordingCache cache = new();
    private readonly Guid categoryId = Guid.NewGuid();
    private readonly Guid recipeId = Guid.NewGuid();
    private string Route => $"/api/v1/recipes/{recipeId}";

    public async Task InitializeAsync()
    {
        var configured = Environment.GetEnvironmentVariable("RECIPE_DELETION_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set RECIPE_DELETION_TEST_CONNECTION (a separate test database is created).");
        var connection = new NpgsqlConnectionStringBuilder(configured)
            { Database = "fr_rcp007_test_" + Guid.NewGuid().ToString("N") };
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["ConnectionStrings:DefaultConnection"] = connection.ConnectionString,
            ["Jwt:Key"] = new string('t', 64),
            ["Minio:AccessKey"] = "unused-test", ["Minio:SecretKey"] = "unused-test"
        });
        builder.Logging.ClearProviders();
        builder.Services.AddApplication();
        builder.Services.AddInfrastructure(builder.Configuration);
        builder.Services.AddRecipeApiConfiguration();
        builder.Services.AddSingleton<IRecipeCacheInvalidator>(cache);
        builder.Services.AddAuthentication("DeletionTest")
            .AddScheme<AuthenticationSchemeOptions, TestAuthentication>("DeletionTest", _ => { });
        builder.Services.AddRateLimiter(options => options.AddConcurrencyLimiter("upload", limiter => limiter.PermitLimit = 10));
        app = builder.Build();
        app.UseMiddleware<GlobalExceptionMiddleware>();
        app.UseRouting(); app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
        app.MapGroup("/api/v1").MapRecipeEndpoints();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.EnsureCreatedAsync();
        var owner = new ApplicationUser { Id = "owner", DisplayName = "Deletion test owner" };
        var category = Category.Create("Deletion test", "deletion-test"); category.Id = categoryId;
        var recipe = NewRecipe("original"); recipe.Id = recipeId;
        db.AddRange(owner, category, recipe);
        db.Add(RecipeImage.Create(recipeId, "original.jpg"));
        db.Add(new RecipeIngredient { RecipeId = recipeId, Name = "Muối", OrderIndex = 0 });
        db.Add(new RecipeStep { RecipeId = recipeId, Title = "Bước 1", Description = "Trộn", StepNumber = 1 });
        await db.SaveChangesAsync();
        await app.StartAsync(); client = app.GetTestClient();
    }

    private Recipe NewRecipe(string slug) => Recipe.Create(slug, slug, "description", "instructions", 1, 1, 2,
        RecipeDifficulty.Easy, categoryId, "owner");

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

    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("reader", HttpStatusCode.Forbidden)]
    [InlineData("other", HttpStatusCode.Forbidden)]
    public async Task Api_denies_unauthorized_deletion_without_mutation(string? user, HttpStatusCode expected)
    {
        User(user);
        Assert.Equal(expected, (await client.DeleteAsync(Route)).StatusCode);
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False((await db.Recipes.SingleAsync()).IsDeleted);
        Assert.Empty(cache.Calls);
    }

    [Theory]
    [InlineData("owner", RecipeStatus.Draft)]
    [InlineData("owner", RecipeStatus.Published)]
    [InlineData("owner", RecipeStatus.Archived)]
    [InlineData("admin", RecipeStatus.Published)]
    public async Task Api_soft_deletes_all_states_preserves_children_and_invalidates_cache(string user, RecipeStatus status)
    {
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Recipes.ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, status));
        }
        User(user);
        var before = DateTime.UtcNow;
        var response = await client.DeleteAsync(Route);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsByteArrayAsync());
        using var verification = app.Services.CreateScope();
        var context = verification.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.Empty(await context.Recipes.ToListAsync());
        var deleted = await context.Recipes.IgnoreQueryFilters().SingleAsync();
        Assert.True(deleted.IsDeleted); Assert.Equal(RecipeStatus.Archived, deleted.Status);
        Assert.InRange(deleted.UpdatedAt!.Value, before, DateTime.UtcNow);
        Assert.Single(await context.RecipeImages.IgnoreQueryFilters().ToListAsync());
        Assert.Single(await context.RecipeSteps.IgnoreQueryFilters().ToListAsync());
        Assert.Single(await context.RecipeIngredients.IgnoreQueryFilters().ToListAsync());
        Assert.Equal((recipeId, "original"), Assert.Single(cache.Calls));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(Route)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/v1/recipes/original")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(Route)).StatusCode);
        // Partial unique index frees the slug while the old record is retained.
        context.Add(NewRecipe("original")); await context.SaveChangesAsync();
        Assert.Single(await context.Recipes.ToListAsync());
    }

    [Fact]
    public async Task Deleted_category_does_not_prevent_recipe_deletion()
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Categories.ExecuteUpdateAsync(s => s.SetProperty(c => c.IsDeleted, true));
        User("owner");
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Route)).StatusCode);
    }

    [Fact]
    public async Task Missing_recipe_returns_404()
    {
        User("owner");
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/v1/recipes/{Guid.NewGuid()}")).StatusCode);
        Assert.Empty(cache.Calls);
    }

    [Fact]
    public async Task Concurrent_write_rolls_back_delete_without_cache_invalidation()
    {
        using var scope = app.Services.CreateScope();
        var unit = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        await unit.Recipes.GetByIdAsync(recipeId);
        using (var other = app.Services.CreateScope())
        {
            var db = other.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var recipe = await db.Recipes.SingleAsync(); recipe.Title = "Concurrent title";
            await db.SaveChangesAsync();
        }
        var handler = new DeleteRecipeCommandHandler(unit, new Owner(), cache);
        await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(new DeleteRecipeCommand(recipeId), default));
        Assert.Empty(cache.Calls);
        using var verify = app.Services.CreateScope();
        Assert.False((await verify.ServiceProvider.GetRequiredService<ApplicationDbContext>().Recipes.SingleAsync()).IsDeleted);
    }

    [Fact]
    public async Task Purge_retains_recent_records_cleans_all_variants_and_cascades_after_30_days()
    {
        var old = NewRecipe("old"); old.SoftDelete();
        var archived = NewRecipe("archived"); archived.Archive();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var image = RecipeImage.Create(old.Id, "original-old.jpg");
            image.MediumUrl = "medium.jpg"; image.ThumbnailUrl = "thumb.jpg";
            var deletedImage = RecipeImage.Create(old.Id, "deleted-image.jpg"); deletedImage.IsDeleted = true;
            db.AddRange(old, archived, image, deletedImage,
                new RecipeStep { RecipeId = old.Id, Title = "Bước 1", Description = "Trộn", StepNumber = 1 },
                new RecipeIngredient { RecipeId = old.Id, Name = "Muối", OrderIndex = 0 });
            await db.SaveChangesAsync();
            await db.Recipes.IgnoreQueryFilters().Where(r => r.Id == old.Id || r.Id == archived.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.UpdatedAt, DateTime.UtcNow.AddDays(-31)));
            (await db.Recipes.SingleAsync(r => r.Id == recipeId)).SoftDelete(); await db.SaveChangesAsync();
        }
        var storage = new RecordingStorage();
        var job = Job(storage);
        await job.RunAsync(default); await job.RunAsync(default);
        Assert.Equal(4, storage.Deleted.Distinct().Count());
        using var verify = app.Services.CreateScope();
        var context = verify.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False(await context.Recipes.IgnoreQueryFilters().AnyAsync(r => r.Id == old.Id));
        Assert.True(await context.Recipes.IgnoreQueryFilters().AnyAsync(r => r.Id == recipeId));
        Assert.True(await context.Recipes.AnyAsync(r => r.Id == archived.Id));
        Assert.False(await context.RecipeImages.IgnoreQueryFilters().AnyAsync(i => i.RecipeId == old.Id));
        Assert.False(await context.RecipeSteps.IgnoreQueryFilters().AnyAsync(i => i.RecipeId == old.Id));
        Assert.False(await context.RecipeIngredients.IgnoreQueryFilters().AnyAsync(i => i.RecipeId == old.Id));
    }

    [Fact]
    public async Task Purge_failure_does_not_block_other_records_or_batches_and_can_retry()
    {
        var recipes = Enumerable.Range(0, 102).Select(i => NewRecipe("batch-" + i)).ToArray();
        var failed = recipes[0];
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            foreach (var recipe in recipes) recipe.SoftDelete();
            db.AddRange(recipes); db.Add(RecipeImage.Create(failed.Id, "fail.jpg"));
            await db.SaveChangesAsync();
            await db.Recipes.IgnoreQueryFilters().Where(r => r.IsDeleted)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.UpdatedAt, DateTime.UtcNow.AddDays(-31)));
        }
        var storage = new RecordingStorage { FailUrl = "fail.jpg" };
        await Assert.ThrowsAsync<AggregateException>(() => Job(storage).RunAsync(default));
        using (var verify = app.Services.CreateScope())
        {
            var db = verify.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            Assert.Equal(failed.Id, (await db.Recipes.IgnoreQueryFilters().SingleAsync(r => r.IsDeleted)).Id);
        }
        storage.FailUrl = null;
        await Job(storage).RunAsync(default);
        using var final = app.Services.CreateScope();
        Assert.False(await final.ServiceProvider.GetRequiredService<ApplicationDbContext>().Recipes.IgnoreQueryFilters().AnyAsync(r => r.IsDeleted));
    }

    private PurgeDeletedRecipesJob Job(IFileStorageService storage) => new(app.Services.GetRequiredService<IServiceScopeFactory>(), storage,
        NullLogger<PurgeDeletedRecipesJob>.Instance);

    [Fact]
    public async Task Real_minio_objects_survive_soft_delete_and_are_removed_only_after_retention()
    {
        var bucket = "fr-rcp007-test-" + Guid.NewGuid().ToString("N");
        using var minio = new MinioClient().WithEndpoint("localhost:9000")
            .WithCredentials(Environment.GetEnvironmentVariable("RECIPE_DELETION_TEST_MINIO_USER")
                ?? throw new InvalidOperationException("Set RECIPE_DELETION_TEST_MINIO_USER."),
                Environment.GetEnvironmentVariable("RECIPE_DELETION_TEST_MINIO_PASSWORD")
                ?? throw new InvalidOperationException("Set RECIPE_DELETION_TEST_MINIO_PASSWORD."))
            .Build();
        var storage = new MinioFileStorageService(minio, Options.Create(new MinioOptions { Bucket = bucket }));
        var urls = new List<string>();
        try
        {
            foreach (var variant in new[] { "original", "medium", "thumbnail" })
            {
                await using var stream = new MemoryStream([1, 2, 3]);
                urls.Add(await storage.UploadAsync(stream, $"recipes/{recipeId}/{variant}.jpg", "image/jpeg"));
            }
            using (var scope = app.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.RecipeImages.ExecuteDeleteAsync();
                var image = RecipeImage.Create(recipeId, urls[0]); image.MediumUrl = urls[1]; image.ThumbnailUrl = urls[2];
                db.Add(image); await db.SaveChangesAsync();
            }
            User("owner");
            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(Route)).StatusCode);
            await Job(storage).RunAsync(default);
            foreach (var url in urls)
            {
                await using var retained = await storage.OpenReadAsync(url);
                Assert.Equal(3, retained.Length);
            }
            using (var scope = app.Services.CreateScope())
                await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Recipes.IgnoreQueryFilters()
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.UpdatedAt, DateTime.UtcNow.AddDays(-31)));
            await Job(storage).RunAsync(default);
            using var http = new HttpClient();
            foreach (var url in urls) Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync(url)).StatusCode);
            await Job(storage).RunAsync(default);
        }
        finally
        {
            // Only objects in this test's randomly named bucket are removed.
            foreach (var url in urls) await storage.DeleteAsync(url);
            if (await minio.BucketExistsAsync(new BucketExistsArgs().WithBucket(bucket)))
                await minio.RemoveBucketAsync(new RemoveBucketArgs().WithBucket(bucket));
        }
    }

    [Fact]
    public async Task Database_delete_failure_is_isolated_and_retains_metadata_for_retry()
    {
        var failed = NewRecipe("database-failure"); failed.SoftDelete();
        var healthy = NewRecipe("healthy"); healthy.SoftDelete();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.AddRange(failed, healthy, RecipeImage.Create(failed.Id, "retry-safe.jpg"));
            await db.SaveChangesAsync();
            await db.Recipes.IgnoreQueryFilters().Where(r => r.IsDeleted)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.UpdatedAt, DateTime.UtcNow.AddDays(-31)));
            await db.Database.ExecuteSqlRawAsync("""
                CREATE FUNCTION fail_one_recipe_delete() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                  IF OLD."Slug" = 'database-failure' THEN RAISE EXCEPTION 'simulated database failure'; END IF;
                  RETURN OLD;
                END $$;
                CREATE TRIGGER fail_one_recipe BEFORE DELETE ON "Recipes" FOR EACH ROW EXECUTE FUNCTION fail_one_recipe_delete();
                """);
        }
        var storage = new RecordingStorage();
        await Assert.ThrowsAsync<AggregateException>(() => Job(storage).RunAsync(default));
        using (var verify = app.Services.CreateScope())
        {
            var db = verify.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            Assert.True(await db.Recipes.IgnoreQueryFilters().AnyAsync(r => r.Id == failed.Id));
            Assert.False(await db.Recipes.IgnoreQueryFilters().AnyAsync(r => r.Id == healthy.Id));
            Assert.True(await db.RecipeImages.IgnoreQueryFilters().AnyAsync(i => i.RecipeId == failed.Id));
            await db.Database.ExecuteSqlRawAsync("DROP TRIGGER fail_one_recipe ON \"Recipes\"; DROP FUNCTION fail_one_recipe_delete();");
        }
        await Job(storage).RunAsync(default);
        Assert.Equal(2, storage.Deleted.Count(url => url == "retry-safe.jpg"));
    }

    private sealed class RecordingCache : IRecipeCacheInvalidator
    {
        public List<(Guid, string?)> Calls { get; } = [];
        public Task InvalidateRecipeAsync(Guid id, string? slug, CancellationToken cancellationToken = default)
        { Calls.Add((id, slug)); return Task.CompletedTask; }
    }

    private sealed class RecordingStorage : IFileStorageService
    {
        public string? FailUrl { get; set; }
        public List<string> Deleted { get; } = [];
        public Task<bool> IsReadyAsync(CancellationToken ct = default) => Task.FromResult(true);
        public Task DeleteAsync(string fileUrl, CancellationToken ct = default)
        { if (fileUrl == FailUrl) throw new IOException("Simulated storage outage"); Deleted.Add(fileUrl); return Task.CompletedTask; }
        public Task<string> UploadAsync(Stream stream, string fileName, string contentType, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<Stream> OpenReadAsync(string fileUrl, CancellationToken ct = default) => throw new NotSupportedException();
    }

    private sealed record Owner : ICurrentUserService
    {
        public string? UserId => "owner";
        public string? Email => null;
        public IReadOnlyList<string> Roles => ["Author"];
        public bool IsAuthenticated => true;
        public bool IsAdmin => false;
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
