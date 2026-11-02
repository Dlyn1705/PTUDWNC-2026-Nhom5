using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using CulinaryBlog.Application.Features.Recipes.Queries.SearchRecipes;
using MediatR;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

// Test-only host: real public endpoints, CQRS, migrations and PostgreSQL, no production startup changes.
var configured = Environment.GetEnvironmentVariable("SEARCH_TEST_CONNECTION")
    ?? throw new InvalidOperationException("Set SEARCH_TEST_CONNECTION for an isolated test PostgreSQL server.");
var connection = new NpgsqlConnectionStringBuilder(configured) { Database = "culinary_search_test_" + Guid.NewGuid().ToString("N") };
var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
    ["ConnectionStrings:DefaultConnection"] = connection.ConnectionString,
    ["Minio:AccessKey"] = "unused", ["Minio:SecretKey"] = "unused" });
builder.Services.AddApplication(); builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddRecipeApiConfiguration(); builder.Services.AddAuthentication();
// Deterministic distributed-cache implementation; Redis outage is tested separately.
builder.Services.AddSingleton<IDistributedCache>(new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions())));
await using var app = builder.Build();
app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseRouting(); app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
var api = app.MapGroup("/api/v1"); api.MapRecipeEndpoints(); api.MapCategoryEndpoints();
var categoryId = Guid.Parse("11111111-1111-4111-8111-111111111111");
var benchmark = Environment.GetEnvironmentVariable("SEARCH_E2E_BENCHMARK");
var datasetSize = benchmark is null ? 40 : 5000;
try
{
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.MigrateAsync();
        var category = Category.Create("Món nước", "mon-nuoc"); category.Id = categoryId;
        db.AddRange(category, new ApplicationUser { Id = "search-e2e", DisplayName = "Search E2E" });
        for (var i = 0; i < datasetSize; i++)
        {
            var recipe = Recipe.Create($"Phở bò {i:D2}", $"pho-bo-{i}", "Món Việt", null,
                5, 10 + i, i < 32 ? 2 : 4, RecipeDifficulty.Easy, categoryId, "search-e2e");
            recipe.Status = benchmark is not null || i < 36 ? RecipeStatus.Published : RecipeStatus.Draft;
            recipe.Steps.Add(RecipeStep.Create(recipe.Id, 1, "Nấu", "Nấu chín"));
            db.Add(recipe);
        }
        await db.SaveChangesAsync();
    }
    await app.StartAsync();
    if (benchmark is not null)
    {
        // Warm application/model/JIT outside measured HTTP traffic; each phase still keeps the real 100/IP policy.
        using (var scope = app.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ISender>().Send(new SearchRecipesQuery(Q: "pho"));
        }
        using var http = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
        (await http.GetAsync("/api/v1/recipes/search?q=pho")).EnsureSuccessStatusCode();
        Console.WriteLine("SEARCH_BENCHMARK warming HTTP pipeline; waiting for the real rate-limit window to reset.");
        await Task.Delay(TimeSpan.FromSeconds(61));
        if (benchmark == "cold")
        {
            using var scope = app.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<CulinaryBlog.Application.Contracts.IPublicContentCache>().InvalidateRecipesAsync();
        }
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var requests = Enumerable.Range(0, 100).Select(async _ => {
            await gate.Task;
            var timer = Stopwatch.StartNew();
            var response = await http.GetAsync("/api/v1/recipes/search?q=pho");
            await response.Content.ReadAsByteArrayAsync();
            return new { milliseconds = timer.Elapsed.TotalMilliseconds, status = (int)response.StatusCode };
        }).ToArray();
        gate.SetResult();
        var results = await Task.WhenAll(requests);
        var sorted = results.Select(x => x.milliseconds).Order().ToArray();
        Console.WriteLine("SEARCH_BENCHMARK " + JsonSerializer.Serialize(new {
            phase = benchmark, datasetSize, concurrentRequests = 100, cache = "MemoryDistributedCache",
            postgresql = "local isolated PostgreSQL", logicalProcessors = Environment.ProcessorCount,
            availableMemoryBytes = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes, operatingSystem = Environment.OSVersion.ToString(),
            p50 = sorted[49], p95 = sorted[94], p99 = sorted[98],
            statuses = results.GroupBy(x => x.status).ToDictionary(x => x.Key, x => x.Count())
        }));
    }
    else
    {
        Console.WriteLine("SEARCH_E2E_READY " + app.Urls.Single());
        // Runner closes stdin even on assertion failure, allowing cleanup on Windows as well.
        await Console.In.ReadLineAsync();
    }
    await app.StopAsync();
}
finally
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    if (db.Database.GetDbConnection().Database != connection.Database) throw new InvalidOperationException("Unsafe test database");
    await db.Database.EnsureDeletedAsync();
}
