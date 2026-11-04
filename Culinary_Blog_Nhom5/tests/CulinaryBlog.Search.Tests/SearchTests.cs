using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Contracts;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using CulinaryBlog.Application.Features.Recipes.Queries.SearchRecipes;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;

namespace CulinaryBlog.Search.Tests;

public sealed partial class SearchTests : IAsyncLifetime
{
    private WebApplication app = null!;
    private HttpClient client = null!;
    private readonly Guid categoryId = Guid.NewGuid();
    private readonly Guid recipeId = Guid.NewGuid();

    private static async Task<string> CreateIsolatedDatabaseAsync(string configured)
    {
        var admin = new NpgsqlConnectionStringBuilder(configured) { Database = "postgres" };
        var database = "culinary_search_test_" + Guid.NewGuid().ToString("N");
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
        var configured = Environment.GetEnvironmentVariable("SEARCH_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set SEARCH_TEST_CONNECTION. Only a new culinary_search_test_<guid> database is modified.");
        var connectionString = await CreateIsolatedDatabaseAsync(configured);
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer(); builder.Logging.ClearProviders();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["ConnectionStrings:DefaultConnection"] = connectionString,
            ["Minio:AccessKey"] = "unused", ["Minio:SecretKey"] = "unused" });
        builder.Services.AddApplication(); builder.Services.AddInfrastructure(builder.Configuration);
        builder.Services.AddRecipeApiConfiguration();
        builder.Services.AddAuthentication("SearchTest").AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, SearchTestAuthentication>("SearchTest", _ => { });
        builder.Services.AddSingleton<IDistributedCache>(new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions())));
        app = builder.Build();
        app.UseMiddleware<GlobalExceptionMiddleware>(); app.UseRouting(); app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
        app.MapGroup("/api/v1").MapRecipeEndpoints();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.MigrateAsync();
        var category = Category.Create("Món nước", "mon-nuoc"); category.Id = categoryId;
        db.AddRange(category, new ApplicationUser { Id = "owner", DisplayName = "Test owner" });
        for (int i = 0; i < 16; i++)
        {
            var recipe = Recipe.Create("Phở bò", "pho-bo-" + i, "Món Việt", null, 5, 20 + i, 2, RecipeDifficulty.Easy, categoryId, "owner");
            if (i == 0) recipe.Id = recipeId;
            recipe.Status = i < 13 ? RecipeStatus.Published : i == 13 ? RecipeStatus.Draft : RecipeStatus.Archived;
            recipe.IsDeleted = i == 15;
            db.Add(recipe);
        }
        await db.SaveChangesAsync();
        db.Add(RecipeIngredient.Create(recipeId, "Đậu hũ", null, null));
        await db.SaveChangesAsync();
        await app.StartAsync(); client = app.GetTestClient();
    }

    private async Task<JsonElement> Search(string query)
    {
        var response = await client.GetAsync("/api/v1/recipes/search?" + query);
        response.EnsureSuccessStatusCode();
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
