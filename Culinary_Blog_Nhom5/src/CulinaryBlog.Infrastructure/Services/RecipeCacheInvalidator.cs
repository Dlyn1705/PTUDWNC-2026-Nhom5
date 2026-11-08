using CulinaryBlog.Application.Contracts;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services;

/// <summary>
/// Cache key contract shared by future recipe query caches and write-side invalidation.
/// Version keys invalidate parameterized list/search/category entries without scanning Redis.
/// </summary>
public static class RecipeCacheKeys
{
    public const string Version = "culinary:recipes:cache-version";

    public static string Detail(Guid recipeId) => $"culinary:recipe:detail:id:{recipeId:N}";

    public static string Detail(string slug) => $"culinary:recipe:detail:slug:{slug}";
}

public sealed class RecipeCacheInvalidator(
    IDistributedCache cache,
    IPublicContentCache publicContentCache,
    ILogger<RecipeCacheInvalidator> logger) : IRecipeCacheInvalidator
{
    private static readonly DistributedCacheEntryOptions VersionOptions = new()
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1)
    };

    public async Task InvalidateRecipeAsync(
        Guid recipeId,
        string? slug,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await cache.RemoveAsync(RecipeCacheKeys.Detail(recipeId), cancellationToken);
            if (!string.IsNullOrWhiteSpace(slug))
                await cache.RemoveAsync(RecipeCacheKeys.Detail(slug), cancellationToken);

            // Parameterized list/search/category keys must include this token when cached.
            // Replacing it invalidates the whole public recipe read set atomically from the
            // readers' perspective and avoids an unsafe Redis key scan.
            await cache.SetStringAsync(
                RecipeCacheKeys.Version,
                Guid.NewGuid().ToString("N"),
                VersionOptions,
                cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // A cache outage must not turn a committed image mutation into a 5xx response.
            // The database remains the source of truth and the cache TTL bounds staleness.
            logger.LogWarning(
                exception,
                "Could not invalidate recipe cache for {RecipeId}; database mutation remains committed",
                recipeId);
        }

        await publicContentCache.InvalidateRecipesAsync(recipeId, slug, CancellationToken.None);
        // Category list DTOs contain published recipe counts, so every recipe
        // lifecycle/child mutation must also invalidate that public projection.
        await publicContentCache.InvalidateCategoriesAsync(cancellationToken: CancellationToken.None);
    }
}
