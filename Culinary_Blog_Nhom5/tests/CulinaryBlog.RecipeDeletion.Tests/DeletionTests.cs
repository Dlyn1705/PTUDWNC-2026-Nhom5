using System.Net;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
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

    private static async Task<string> CreateIsolatedDatabaseAsync(string configured)
    {
        var admin = new NpgsqlConnectionStringBuilder(configured) { Database = "postgres" };
        var database = "fr_rcp007_test_" + Guid.NewGuid().ToString("N");
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
        var configured = Environment.GetEnvironmentVariable("RECIPE_DELETION_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set RECIPE_DELETION_TEST_CONNECTION (a separate test database is created).");
        var connectionString = await CreateIsolatedDatabaseAsync(configured);
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["ConnectionStrings:DefaultConnection"] = connectionString,
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
