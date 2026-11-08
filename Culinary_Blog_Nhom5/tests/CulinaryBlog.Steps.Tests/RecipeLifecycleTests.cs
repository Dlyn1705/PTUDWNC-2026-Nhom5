using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace CulinaryBlog.Steps.Tests;

public sealed partial class StepApiTests
{
    [Fact]
    public async Task Published_metric_counts_transitions_not_repeated_requests()
    {
        long count = 0;
        using var listener = new System.Diagnostics.Metrics.MeterListener();
        listener.InstrumentPublished = (instrument, meter) => { if (instrument.Name == "recipe.published") meter.EnableMeasurementEvents(instrument); };
        listener.SetMeasurementEventCallback<long>((_, value, _, _) => Interlocked.Add(ref count, value)); listener.Start();
        await Add();
        foreach (var action in new[] { "publish", "publish" })
            (await client.PatchAsync($"/api/v1/recipes/{recipeId}/{action}", null)).EnsureSuccessStatusCode();
        Assert.Equal(1, count);
        (await client.PatchAsync($"/api/v1/recipes/{recipeId}/unpublish", null)).EnsureSuccessStatusCode();
        (await client.PatchAsync($"/api/v1/recipes/{recipeId}/publish", null)).EnsureSuccessStatusCode();
        Assert.Equal(2, count);
    }

    [Fact]
    public async Task Real_public_caches_and_counts_follow_each_committed_transition()
    {
        await Add();
        async Task AssertVisibility(int expected)
        {
            // Repeating every read primes/hits real public cache entries, not a mock read projection.
            for (var repeat = 0; repeat < 2; repeat++)
            {
                User(null);
                var list = await client.GetFromJsonAsync<JsonElement>("/api/v1/recipes");
                Assert.Equal(expected, list.GetProperty("meta").GetProperty("totalCount").GetInt32());
                var search = await client.GetFromJsonAsync<JsonElement>("/api/v1/recipes/search?q=steps");
                Assert.Equal(expected, search.GetProperty("meta").GetProperty("totalCount").GetInt32());
                var categories = await client.GetFromJsonAsync<JsonElement>("/api/v1/categories");
                Assert.Equal(expected, categories.GetProperty("data")[0].GetProperty("recipeCount").GetInt32());
                var category = await client.GetFromJsonAsync<JsonElement>("/api/v1/categories/steps-test");
                Assert.Equal(expected, category.GetProperty("meta").GetProperty("totalCount").GetInt32());
                Assert.Equal(expected == 1 ? HttpStatusCode.OK : HttpStatusCode.NotFound,
                    (await client.GetAsync("/api/v1/recipes/steps-test")).StatusCode);
            }
            User("owner");
        }
        await AssertVisibility(0);
        foreach (var action in new[] { "publish", "unpublish", "publish", "archive", "unarchive" })
        {
            (await client.PatchAsync($"/api/v1/recipes/{recipeId}/{action}", null)).EnsureSuccessStatusCode();
            await AssertVisibility(action == "publish" ? 1 : 0);
        }
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task Publish_reports_all_missing_active_children_without_mutating(bool step, bool ingredient)
    {
        if (step) await Add();
        using var scope = app.Services.CreateScope(); var db = Db(scope);
        var existingIngredient = await db.RecipeIngredients.SingleAsync();
        existingIngredient.IsDeleted = !ingredient; await db.SaveChangesAsync();
        var recipe = await db.Recipes.AsNoTracking().SingleAsync();
        var response = await client.PatchAsync($"/api/v1/recipes/{recipeId}/publish", null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var errors = body.GetProperty("errors");
        Assert.Equal(!step, errors.TryGetProperty("steps", out _));
        Assert.Equal(!ingredient, errors.TryGetProperty("ingredients", out _));
        var after = await db.Recipes.AsNoTracking().SingleAsync();
        Assert.Equal(recipe.RowVersion, after.RowVersion); Assert.Equal(RecipeStatus.Draft, after.Status); Assert.Null(after.PublishedAt);
    }

    [Fact]
    public async Task Repeated_publish_is_idempotent_even_after_allowed_last_ingredient_deletion()
    {
        await Add();
        (await client.PatchAsync($"/api/v1/recipes/{recipeId}/publish", null)).EnsureSuccessStatusCode();
        using var scope = app.Services.CreateScope(); var db = Db(scope);
        var ingredient = await db.RecipeIngredients.SingleAsync();
        var version = await Read();
        Assert.Equal(HttpStatusCode.NoContent, (await Write(HttpMethod.Delete,
            $"/api/v1/recipes/{recipeId}/ingredients/{ingredient.Id}", null, version.Etag)).StatusCode);
        var before = await db.Recipes.AsNoTracking().SingleAsync();
        (await client.PatchAsync($"/api/v1/recipes/{recipeId}/publish", null)).EnsureSuccessStatusCode();
        var after = await db.Recipes.AsNoTracking().SingleAsync();
        Assert.Equal(before.PublishedAt, after.PublishedAt); Assert.Equal(before.RowVersion, after.RowVersion);
    }

    [Fact]
    public async Task Unarchive_retries_a_lost_commit_ACK_without_returning_a_false_conflict()
    {
        (await client.PatchAsync($"/api/v1/recipes/{recipeId}/archive", null)).EnsureSuccessStatusCode();
        commitAck.Armed = true;
        (await client.PatchAsync($"/api/v1/recipes/{recipeId}/unarchive", null)).EnsureSuccessStatusCode();
        Assert.True(commitAck.Fired);
        using var scope = app.Services.CreateScope(); Assert.Equal(RecipeStatus.Draft, (await Db(scope).Recipes.SingleAsync()).Status);
    }

    [Fact]
    public async Task Publish_and_last_ingredient_delete_share_the_recipe_lock_and_ETag()
    {
        await Add(); var version = await Read();
        using var scope = app.Services.CreateScope(); var ingredient = await Db(scope).RecipeIngredients.SingleAsync();
        var results = await Task.WhenAll(client.PatchAsync($"/api/v1/recipes/{recipeId}/publish", null),
            Write(HttpMethod.Delete, $"/api/v1/recipes/{recipeId}/ingredients/{ingredient.Id}", null, version.Etag));
        Assert.All(results, response => Assert.Contains(response.StatusCode,
            new[] { HttpStatusCode.OK, HttpStatusCode.NoContent, HttpStatusCode.Conflict, HttpStatusCode.UnprocessableEntity }));
        if (results[1].StatusCode == HttpStatusCode.NoContent)
            Assert.Equal(HttpStatusCode.UnprocessableEntity, results[0].StatusCode);
    }

    [Theory]
    [InlineData(null, 401)]
    [InlineData("other", 403)]
    [InlineData("reader", 403)]
    [InlineData("owner", 200)]
    [InlineData("admin", 200)]
    public async Task Lifecycle_endpoints_authorize_owner_or_admin(string? actor, int expected)
    {
        User(actor);
        var response = await client.PatchAsync($"/api/v1/recipes/{recipeId}/archive", null);
        Assert.Equal(expected, (int)response.StatusCode);
    }

    [Fact]
    public async Task Lifecycle_transition_table_and_soft_deleted_visibility_are_enforced()
    {
        var url = $"/api/v1/recipes/{recipeId}/";
        Assert.Equal(HttpStatusCode.Conflict, (await client.PatchAsync(url + "unarchive", null)).StatusCode);
        (await client.PatchAsync(url + "unpublish", null)).EnsureSuccessStatusCode();
        await Add();
        foreach (var action in new[] { "publish", "unpublish", "unpublish", "archive", "archive" })
            (await client.PatchAsync(url + action, null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PatchAsync(url + "publish", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PatchAsync(url + "unpublish", null)).StatusCode);
        (await client.PatchAsync(url + "unarchive", null)).EnsureSuccessStatusCode();
        using var scope = app.Services.CreateScope(); var db = Db(scope);
        var recipe = await db.Recipes.SingleAsync(); Assert.Equal(RecipeStatus.Draft, recipe.Status); Assert.Null(recipe.PublishedAt);
        recipe.SoftDelete(); await db.SaveChangesAsync();
        foreach (var action in new[] { "publish", "unpublish", "archive", "unarchive" })
            Assert.Equal(HttpStatusCode.NotFound, (await client.PatchAsync(url + action, null)).StatusCode);
    }
}
