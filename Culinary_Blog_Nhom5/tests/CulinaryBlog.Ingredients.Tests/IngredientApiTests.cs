using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
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

    private static async Task<string> CreateIsolatedDatabaseAsync(string configured)
    {
        var admin = new NpgsqlConnectionStringBuilder(configured) { Database = "postgres" };
        var database = "fr_rcp009_test_" + Guid.NewGuid().ToString("N");
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
        var configured = Environment.GetEnvironmentVariable("INGREDIENTS_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set INGREDIENTS_TEST_CONNECTION to a local PostgreSQL connection with CREATE DATABASE permission.");
        var connectionString = await CreateIsolatedDatabaseAsync(configured);
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = connectionString,
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
