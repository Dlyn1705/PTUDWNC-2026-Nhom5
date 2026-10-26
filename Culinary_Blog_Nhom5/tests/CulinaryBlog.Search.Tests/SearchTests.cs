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

public sealed class SearchTests : IAsyncLifetime
{
    private WebApplication app = null!;
    private HttpClient client = null!;
    private readonly Guid categoryId = Guid.NewGuid();
    private readonly Guid recipeId = Guid.NewGuid();

    public async Task InitializeAsync()
    {
        var configured = Environment.GetEnvironmentVariable("SEARCH_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set SEARCH_TEST_CONNECTION. Only a new culinary_search_test_<guid> database is modified.");
        var connection = new NpgsqlConnectionStringBuilder(configured) { Database = "culinary_search_test_" + Guid.NewGuid().ToString("N") };
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer(); builder.Logging.ClearProviders();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["ConnectionStrings:DefaultConnection"] = connection.ConnectionString,
            ["Minio:AccessKey"] = "unused", ["Minio:SecretKey"] = "unused" });
        builder.Services.AddApplication(); builder.Services.AddInfrastructure(builder.Configuration);
        builder.Services.AddRecipeApiConfiguration(); builder.Services.AddAuthentication();
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

    [Fact]
    public async Task Upgrade_backfills_existing_ingredients_and_can_roll_back()
    {
        using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261020023156_SyncLatestTargetModel");
        Assert.Empty((await Search("q=dau%20hu")).GetProperty("data").EnumerateArray());
        await migrator.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<IRecipeCacheInvalidator>().InvalidateRecipeAsync(recipeId, null);
        Assert.Single((await Search("q=dau%20hu")).GetProperty("data").EnumerateArray());
    }

    [Fact]
    public async Task Sort_and_servings_alias_preserve_contract()
    {
        var ascending = await Search("q=pho&sortBy=cookTime&sortOrder=asc&servings=2");
        var values = ascending.GetProperty("data").EnumerateArray().Select(x => x.GetProperty("cookTime").GetInt32()).ToArray();
        Assert.Equal(values.Order().ToArray(), values);
        var descending = await Search("q=pho&sort=-cookTime");
        var desc = descending.GetProperty("data").EnumerateArray().Select(x => x.GetProperty("cookTime").GetInt32()).ToArray();
        Assert.Equal(desc.OrderDescending().ToArray(), desc);
        Assert.Empty((await Search("q=pho&servings=3")).GetProperty("data").EnumerateArray());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,
            (await client.GetAsync("/api/v1/recipes/search?q=pho&servings=2&minServings=3")).StatusCode);
    }

    [Fact]
    public async Task Contract_pagination_and_accents_are_consistent()
    {
        var first = await Search("q=phở%20bò&pageSize=5");
        Assert.Equal(JsonValueKind.Array, first.GetProperty("data").ValueKind);
        Assert.Equal(13, first.GetProperty("meta").GetProperty("totalCount").GetInt32());
        var plain = await Search("q=pho%20bo&pageSize=5");
        Assert.Equal(first.GetProperty("data").GetRawText(), plain.GetProperty("data").GetRawText());
        var second = await Search("q=pho%20bo&pageSize=5&page=2");
        var ids = first.GetProperty("data").EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).ToHashSet();
        Assert.DoesNotContain(second.GetProperty("data").EnumerateArray(), x => ids.Contains(x.GetProperty("id").GetGuid()));
    }

    [Fact]
    public async Task Ingredients_are_searchable_and_changes_refresh_vector()
    {
        Assert.Single((await Search("q=dau%20hu")).GetProperty("data").EnumerateArray());
        using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var ingredient = await db.RecipeIngredients.SingleAsync(x => x.RecipeId == recipeId);
        ingredient.Name = "Nghệ"; await db.SaveChangesAsync();
        await scope.ServiceProvider.GetRequiredService<IRecipeCacheInvalidator>().InvalidateRecipeAsync(recipeId, null);
        Assert.Empty((await Search("q=dau%20hu")).GetProperty("data").EnumerateArray());
        Assert.Single((await Search("q=nghe")).GetProperty("data").EnumerateArray());
        ingredient.IsDeleted = true; await db.SaveChangesAsync();
        await scope.ServiceProvider.GetRequiredService<IRecipeCacheInvalidator>().InvalidateRecipeAsync(recipeId, null);
        Assert.Empty((await Search("q=nghe")).GetProperty("data").EnumerateArray());
        ingredient.IsDeleted = false; await db.SaveChangesAsync();
        await scope.ServiceProvider.GetRequiredService<IRecipeCacheInvalidator>().InvalidateRecipeAsync(recipeId, null);
        Assert.Single((await Search("q=nghe")).GetProperty("data").EnumerateArray());
        db.Remove(ingredient); await db.SaveChangesAsync();
        await scope.ServiceProvider.GetRequiredService<IRecipeCacheInvalidator>().InvalidateRecipeAsync(recipeId, null);
        Assert.Empty((await Search("q=nghe")).GetProperty("data").EnumerateArray());
    }

    [Fact]
    public async Task Filters_are_AND_and_hidden_recipes_disappear_immediately()
    {
        var result = await Search($"q=pho&categoryId={categoryId}&difficulty=1&maxCookTime=20&minServings=2&maxServings=2");
        Assert.Single(result.GetProperty("data").EnumerateArray());
        Assert.Empty((await Search("q=pho&difficulty=2")).GetProperty("data").EnumerateArray());
        using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var recipe = await db.Recipes.SingleAsync(x => x.Id == recipeId);
        recipe.Status = RecipeStatus.Archived; await db.SaveChangesAsync();
        await scope.ServiceProvider.GetRequiredService<IRecipeCacheInvalidator>().InvalidateRecipeAsync(recipeId, null);
        Assert.Empty((await Search("q=pho&maxCookTime=20")).GetProperty("data").EnumerateArray());
    }

    [Theory]
    [InlineData("")]
    [InlineData("q=%20%20")]
    [InlineData("q=%25%25")]
    [InlineData("q=khongtimthay")]
    public async Task Empty_or_no_match_returns_empty_success(string query) =>
        Assert.Empty((await Search(query)).GetProperty("data").EnumerateArray());

    [Theory]
    [InlineData("q=a")]
    [InlineData("q=pho&pageSize=51")]
    [InlineData("q=pho&page=0")]
    [InlineData("q=pho&minCookTime=30&maxCookTime=10")]
    [InlineData("q=pho&sortBy=unsafe")]
    public async Task Invalid_query_returns_422(string query) =>
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.GetAsync("/api/v1/recipes/search?" + query)).StatusCode);

    public async Task DisposeAsync()
    {
        client?.Dispose();
        if (app is null) return;
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        if (!db.Database.GetDbConnection().Database.StartsWith("culinary_search_test_")) throw new InvalidOperationException("Unsafe test database");
        await db.Database.EnsureDeletedAsync();
        await app.DisposeAsync();
    }
}
