using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace CulinaryBlog.Search.Tests;

public sealed partial class SearchTests
{
    [Fact]
    public async Task Public_search_stays_public_for_admin_and_lifecycle_endpoints_invalidate_cached_results()
    {
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Add(RecipeStep.Create(recipeId, 1, "Nấu", "Nấu chín"));
            await db.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Add("X-Search-Test-Admin", "true");
        Assert.Equal(13, (await Search("q=pho")).GetProperty("meta").GetProperty("totalCount").GetInt32());
        Assert.Single((await Search("q=dau%20hu")).GetProperty("data").EnumerateArray());
        foreach (var operation in new[] { "unpublish", "publish", "archive", "unarchive", "publish" })
        {
            var response = await client.PatchAsync($"/api/v1/recipes/{recipeId}/{operation}", null);
            response.EnsureSuccessStatusCode();
            var visible = operation == "publish";
            Assert.Equal(visible ? 1 : 0, (await Search("q=dau%20hu")).GetProperty("data").GetArrayLength());
        }
        (await client.DeleteAsync($"/api/v1/recipes/{recipeId}")).EnsureSuccessStatusCode();
        Assert.Empty((await Search("q=dau%20hu")).GetProperty("data").EnumerateArray());
    }

    [Theory]
    [InlineData("---")]
    [InlineData("' | & ! : * ( )")]
    [InlineData("'; DROP TABLE Recipes; --")]
    public async Task Punctuation_and_SQL_like_text_cannot_break_search(string keyword)
    {
        await Search("q=" + Uri.EscapeDataString(keyword));
        Assert.Equal(13, (await Search("q=pho")).GetProperty("meta").GetProperty("totalCount").GetInt32());
    }

    [Theory]
    [InlineData("q=pho&pageSize=0")]
    [InlineData("q=pho&page=-1")]
    [InlineData("q=pho&page=2147483647&pageSize=50")]
    [InlineData("q=pho&difficulty=99")]
    [InlineData("q=pho&servings=0")]
    [InlineData("q=pho&minServings=4&maxServings=2")]
    [InlineData("q=pho&maxCookTime=-1")]
    [InlineData("q=pho&sortOrder=unsafe")]
    public async Task Invalid_semantic_parameters_have_problem_details(string query)
    {
        var response = await client.GetAsync("/api/v1/recipes/search?" + query);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(422, problem.GetProperty("status").GetInt32());
        Assert.True(problem.TryGetProperty("errors", out _));
    }

    [Theory]
    [InlineData("q=pho&categoryId=invalid")]
    [InlineData("q=pho&page=1.5")]
    [InlineData("q=pho&maxCookTime=abc")]
    public async Task Invalid_HTTP_types_return_400(string query) =>
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/v1/recipes/search?" + query)).StatusCode);

    [Fact]
    public async Task Keyword_boundaries_and_default_metadata_are_explicit()
    {
        Assert.Equal(HttpStatusCode.UnprocessableEntity,
            (await client.GetAsync("/api/v1/recipes/search?q=" + new string('a', 101))).StatusCode);
        var result = await Search("q=pho");
        Assert.Equal(12, result.GetProperty("data").GetArrayLength());
        var meta = result.GetProperty("meta");
        Assert.Equal(12, meta.GetProperty("pageSize").GetInt32());
        Assert.True(meta.GetProperty("hasNextPage").GetBoolean());
        Assert.False(meta.GetProperty("hasPreviousPage").GetBoolean());
        Assert.Equal(13, (await Search("q=pho&pageSize=50")).GetProperty("data").GetArrayLength());
    }

    [Fact]
    public async Task Ranking_includes_description_and_ingredients_and_refreshes_recipe_text()
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var recipes = new[] {
            Recipe.Create("Nghệ", "rank-title", "Món ăn", null, 0, 5, 2, RecipeDifficulty.Easy, categoryId, "owner"),
            Recipe.Create("Món vàng", "rank-description", "Nghệ", null, 0, 5, 2, RecipeDifficulty.Easy, categoryId, "owner"),
            Recipe.Create("Món hấp", "rank-ingredient", "Món ăn", null, 0, 5, 2, RecipeDifficulty.Easy, categoryId, "owner") };
        foreach (var recipe in recipes) { recipe.Status = RecipeStatus.Published; db.Add(recipe); }
        await db.SaveChangesAsync();
        db.Add(RecipeIngredient.Create(recipes[2].Id, "Nghệ", null, null));
        await db.SaveChangesAsync();
        var result = await Search("q=NGHỆ");
        Assert.Equal(recipes.Select(x => x.Id), result.GetProperty("data").EnumerateArray().Select(x => x.GetProperty("id").GetGuid()));
        Assert.Equal(result.GetProperty("data").GetRawText(), (await Search("q=nghe")).GetProperty("data").GetRawText());
        recipes[0].Title = "Gừng"; recipes[1].Description = "Gừng";
        await db.SaveChangesAsync();
        await scope.ServiceProvider.GetRequiredService<IRecipeCacheInvalidator>().InvalidateRecipeAsync(recipes[0].Id, null);
        Assert.Single((await Search("q=nghe")).GetProperty("data").EnumerateArray());
        Assert.Equal(2, (await Search("q=gung")).GetProperty("data").GetArrayLength());
    }

    [Fact]
    public async Task Combined_filters_sort_and_pagination_keep_the_same_result_set()
    {
        var query = $"q=pho&categoryId={categoryId}&difficulty=1&maxCookTime=30&servings=2&sortBy=cookTime&sortOrder=asc&pageSize=5";
        var first = await Search(query); var second = await Search(query + "&page=2");
        Assert.Equal(11, first.GetProperty("meta").GetProperty("totalCount").GetInt32());
        var a = first.GetProperty("data").EnumerateArray().ToArray();
        var b = second.GetProperty("data").EnumerateArray().ToArray();
        Assert.Equal(Enumerable.Range(20, 10), a.Concat(b).Select(x => x.GetProperty("cookTime").GetInt32()));
        var canonical = await Search("q=pho&sortBy=cookTime&sortOrder=asc&sort=unsafe");
        var baseline = await Search("q=pho&sortBy=cookTime&sortOrder=asc");
        Assert.Equal(baseline.GetRawText(), canonical.GetRawText());
    }

    [Fact]
    public async Task Schema_has_unaccent_and_GIN_and_explain_can_execute()
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Database.OpenConnectionAsync();
        using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = "SELECT count(*) FROM pg_extension WHERE extname='unaccent'";
        Assert.Equal(1L, await command.ExecuteScalarAsync());
        command.CommandText = "SELECT indexdef FROM pg_indexes WHERE tablename='Recipes' AND indexname='IX_Recipes_SearchVector'";
        Assert.Contains("USING gin", (string)(await command.ExecuteScalarAsync())!);
        command.CommandText = "EXPLAIN (ANALYZE, BUFFERS) SELECT \"Id\" FROM \"Recipes\" WHERE \"SearchVector\" @@ to_tsquery('simple', 'pho:*') AND \"Status\"=1 AND NOT \"IsDeleted\"";
        using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
    }
}
