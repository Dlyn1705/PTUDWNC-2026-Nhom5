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

public sealed partial class StepApiTests : IAsyncLifetime
{
    private WebApplication app = null!;
    private HttpClient client = null!;
    private readonly Guid recipeId = Guid.NewGuid();
    private readonly Guid categoryId = Guid.NewGuid();
    private readonly RecordingCache cache = new();
    private readonly CommitAckFailure commitAck = new();
    private string Route => $"/api/v1/recipes/{recipeId}/steps";
    private ApplicationDbContext Db(IServiceScope scope) => scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

    private static async Task<string> CreateIsolatedDatabaseAsync(string configured)
    {
        var admin = new NpgsqlConnectionStringBuilder(configured) { Database = "postgres" };
        var database = "fr_rcp010_test_" + Guid.NewGuid().ToString("N");
        await using (var connection = new NpgsqlConnection(admin.ConnectionString))
        {
            await connection.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", connection);
            await create.ExecuteNonQueryAsync();
        }

        return new NpgsqlConnectionStringBuilder(admin.ConnectionString) { Database = database }.ConnectionString;
    }

    public async Task InitializeAsync()
    {
        var configured = Environment.GetEnvironmentVariable("STEPS_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set STEPS_TEST_CONNECTION; only a new fr_rcp010_test_<guid> database is modified.");
        var connectionString = await CreateIsolatedDatabaseAsync(configured);
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer(); builder.Logging.ClearProviders();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["ConnectionStrings:DefaultConnection"] = connectionString,
            ["Minio:AccessKey"] = "test-unused", ["Minio:SecretKey"] = "test-unused" });
        builder.Services.AddApplication(); builder.Services.AddInfrastructure(builder.Configuration);
        builder.Services.AddDbContext<ApplicationDbContext>(options => options.AddInterceptors(commitAck));
        builder.Services.AddSingleton<IRecipeCacheInvalidator>(cache);
        builder.Services.AddSingleton<Microsoft.Extensions.Caching.Distributed.IDistributedCache>(
            new Microsoft.Extensions.Caching.Distributed.MemoryDistributedCache(Options.Create(new Microsoft.Extensions.Caching.Memory.MemoryDistributedCacheOptions())));
        builder.Services.AddRecipeApiConfiguration();
        builder.Services.AddAuthentication("StepsTest").AddScheme<AuthenticationSchemeOptions, TestAuthentication>("StepsTest", _ => { });
        builder.Services.AddRateLimiter(options => options.AddConcurrencyLimiter("upload", limiter => limiter.PermitLimit = 10));
        app = builder.Build();
        app.UseMiddleware<GlobalExceptionMiddleware>(); app.UseRouting(); app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
        var api = app.MapGroup("/api/v1"); api.MapRecipeEndpoints(); api.MapRecipeStepEndpoints(); api.MapRecipeIngredientEndpoints(); api.MapCategoryEndpoints();
        cache.Forward = async () => {
            using var cacheScope = app.Services.CreateScope();
            var content = cacheScope.ServiceProvider.GetRequiredService<IPublicContentCache>();
            await content.InvalidateRecipesAsync(); await content.InvalidateCategoriesAsync();
        };
        using var scope = app.Services.CreateScope(); var db = Db(scope);
        await db.Database.MigrateAsync();
        var category = Category.Create("Steps test", "steps-test"); category.Id = categoryId;
        var recipe = NewRecipe("steps-test"); recipe.Id = recipeId;
        db.AddRange(new ApplicationUser { Id = "owner", DisplayName = "Steps test owner" }, category, recipe);
        db.Add(RecipeIngredient.Create(recipe.Id, "Muối", null, null));
        await db.SaveChangesAsync();
        await app.StartAsync(); client = app.GetTestClient(); User("owner");
    }
