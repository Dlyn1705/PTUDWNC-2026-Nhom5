using System.Text.Json;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class PublicContentCache(
    IDistributedCache cache,
    ILogger<PublicContentCache> logger) : IPublicContentCache
{
    private static readonly TimeSpan CategoryTtl = TimeSpan.FromMinutes(45);
    private static readonly TimeSpan RecipeListTtl = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan RecipeDetailTtl = TimeSpan.FromHours(1);
    private const string CategoryVersionKey = "public:categories:version";
    private const string RecipeVersionKey = "public:recipes:version";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(
        Func<CancellationToken, Task<IReadOnlyList<CategoryDto>>> factory,
        CancellationToken cancellationToken = default) =>
        await GetOrCreateAsync(
            $"public:categories:list:v:{await GetVersionAsync(CategoryVersionKey, cancellationToken)}",
            CategoryTtl,
            factory,
            cancellationToken);

    public async Task<CategoryDetailDto> GetCategoryAsync(
        string slug,
        int page,
        int pageSize,
        Func<CancellationToken, Task<CategoryDetailDto>> factory,
        CancellationToken cancellationToken = default) =>
        await GetOrCreateAsync(
            $"public:categories:detail:{slug.ToLowerInvariant()}:{page}:{pageSize}:cv:{await GetVersionAsync(CategoryVersionKey, cancellationToken)}:rv:{await GetVersionAsync(RecipeVersionKey, cancellationToken)}",
            CategoryTtl,
            factory,
            cancellationToken);

    public async Task<PagedResult<RecipeSummaryDto>> GetRecipesAsync(
        string queryKey,
        Func<CancellationToken, Task<PagedResult<RecipeSummaryDto>>> factory,
        CancellationToken cancellationToken = default) =>
        await GetOrCreateAsync(
            $"public:recipes:list:{queryKey}:v:{await GetVersionAsync(RecipeVersionKey, cancellationToken)}",
            RecipeListTtl,
            factory,
            cancellationToken);

    public async Task<RecipeDetailDto> GetRecipeAsync(
        string slug,
        Func<CancellationToken, Task<RecipeDetailDto>> factory,
        CancellationToken cancellationToken = default) =>
        await GetOrCreateAsync(
            $"public:recipes:detail:{slug.ToLowerInvariant()}:v:{await GetVersionAsync(RecipeVersionKey, cancellationToken)}",
            RecipeDetailTtl,
            factory,
            cancellationToken);

    public async Task InvalidateCategoriesAsync(string? slug = null, CancellationToken cancellationToken = default)
    {
        await RotateVersionAsync(CategoryVersionKey, cancellationToken);
    }

    public async Task InvalidateRecipesAsync(Guid? recipeId = null, string? slug = null, CancellationToken cancellationToken = default)
    {
        await RotateVersionAsync(RecipeVersionKey, cancellationToken);
    }

    private async Task<T> GetOrCreateAsync<T>(
        string key,
        TimeSpan ttl,
        Func<CancellationToken, Task<T>> factory,
        CancellationToken cancellationToken)
    {
        try
        {
            var cached = await cache.GetStringAsync(key, cancellationToken);
            if (cached is not null)
            {
                var value = JsonSerializer.Deserialize<T>(cached, JsonOptions);
                if (value is not null) return value;
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Could not read public content cache key {CacheKey}; using database", key);
        }

        var result = await factory(cancellationToken);
        try
        {
            await cache.SetStringAsync(
                key,
                JsonSerializer.Serialize(result, JsonOptions),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl },
                cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Could not write public content cache key {CacheKey}; returning database result", key);
        }

        return result;
    }

    private async Task<string> GetVersionAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            return await cache.GetStringAsync(key, cancellationToken) ?? "0";
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Could not read cache version {CacheKey}; using uncached version", key);
            return Guid.NewGuid().ToString("N");
        }
    }

    private async Task RotateVersionAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            await cache.SetStringAsync(
                key,
                Guid.NewGuid().ToString("N"),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromDays(7) },
                cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Could not invalidate public content cache version {CacheKey}; database mutation remains committed", key);
        }
    }
}
