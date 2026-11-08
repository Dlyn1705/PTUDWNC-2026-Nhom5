using System.Text.Json;
using Microsoft.Extensions.Options;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class PublicContentCache(
    IDistributedCache cache,
    ILogger<PublicContentCache> logger,
    PendingPublicCacheInvalidations? pendingInvalidations = null,
    IOptions<PublicCacheOptions>? options = null,
    IFrontendRevalidationClient? frontendRevalidation = null) : IPublicContentCache
{
    private readonly PendingPublicCacheInvalidations pending = pendingInvalidations ?? new();
    private readonly PublicCacheOptions settings = options?.Value ?? new();
    private const string CategoryVersionKey = "public:categories:version";
    private const string RecipeVersionKey = "public:recipes:version";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<PagedResult<SearchRecipeSummaryDto>> GetSearchAsync(
        string queryKey,
        Func<CancellationToken, Task<PagedResult<SearchRecipeSummaryDto>>> factory,
        CancellationToken cancellationToken = default)
    {
        var key = $"public:recipes:search:{queryKey}:rv:{await GetVersionAsync(RecipeVersionKey, cancellationToken)}:cv:{await GetVersionAsync(CategoryVersionKey, cancellationToken)}";
        return await GetOrCreateAsync(
            key,
            "search", TimeSpan.FromMinutes(settings.SearchMinutes),
            factory,
            cancellationToken);
    }

    public async Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(
        Func<CancellationToken, Task<IReadOnlyList<CategoryDto>>> factory,
        CancellationToken cancellationToken = default) =>
        await GetOrCreateAsync(
            $"public:categories:list:v:{await GetVersionAsync(CategoryVersionKey, cancellationToken)}",
            "category", TimeSpan.FromMinutes(settings.CategoryMinutes),
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
            "category", TimeSpan.FromMinutes(settings.CategoryMinutes),
            factory,
            cancellationToken);

    public async Task<PagedResult<RecipeSummaryDto>> GetRecipesAsync(
        string queryKey,
        Func<CancellationToken, Task<PagedResult<RecipeSummaryDto>>> factory,
        CancellationToken cancellationToken = default) =>
        await GetOrCreateAsync(
            $"public:recipes:list:{queryKey}:v:{await GetVersionAsync(RecipeVersionKey, cancellationToken)}",
            "list", TimeSpan.FromMinutes(settings.ListMinutes),
            factory,
            cancellationToken);

    public async Task<RecipeDetailDto> GetRecipeAsync(
        string slug,
        Func<CancellationToken, Task<RecipeDetailDto>> factory,
        CancellationToken cancellationToken = default) =>
        await GetOrCreateAsync(
            $"public:recipes:detail:{slug.ToLowerInvariant()}:v:{await GetVersionAsync(RecipeVersionKey, cancellationToken)}",
            "detail", TimeSpan.FromMinutes(settings.DetailMinutes),
            factory,
            cancellationToken);

    public async Task InvalidateCategoriesAsync(string? slug = null, CancellationToken cancellationToken = default)
    {
        await RotateVersionAsync(CategoryVersionKey, cancellationToken);
        if (frontendRevalidation is not null)
            await frontendRevalidation.RevalidateAsync(
                ["public:categories"],
                ["/", "/categories"],
                CancellationToken.None);
    }

    public async Task InvalidateRecipesAsync(Guid? recipeId = null, string? slug = null, CancellationToken cancellationToken = default)
    {
        await RotateVersionAsync(RecipeVersionKey, cancellationToken);
        var tags = new List<string> { "public:recipes" };
        var paths = new List<string> { "/", "/recipes" };
        if (!string.IsNullOrWhiteSpace(slug))
        {
            tags.Add($"public:recipe:{slug}");
            paths.Add($"/recipes/{Uri.EscapeDataString(slug)}");
        }
        if (frontendRevalidation is not null)
            await frontendRevalidation.RevalidateAsync(tags, paths, CancellationToken.None);
    }

    private async Task<T> GetOrCreateAsync<T>(
        string key,
        string kind, TimeSpan ttl,
        Func<CancellationToken, Task<T>> factory,
        CancellationToken cancellationToken) where T : class
    {
        var readFailed = false;
        async Task<T?> ReadAsync()
        {
            try
            {
                var cached = await cache.GetStringAsync(key, cancellationToken);
                return cached is null ? null : JsonSerializer.Deserialize<T>(cached, JsonOptions);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                readFailed = true;
                logger.LogWarning(exception, "Could not read public content cache key {CacheKey}; using database", key);
                return null;
            }
        }
        void Record(string outcome) => PerformanceMetrics.CacheReads.Add(1, new("cache.kind", kind), new("cache.outcome", outcome));

        // A warm read must never queue behind unrelated network I/O for the same key.
        var cachedValue = await ReadAsync();
        if (cachedValue is not null) { Record("hit"); return cachedValue; }
        IDisposable? lease = null;
        try
        {
            // Coalesce healthy cold misses only; outage fallback must not queue every DB read.
            if (!readFailed && cache is not Reliability.ResilientCache { WasBypassed: true })
            {
                lease = await SearchCacheLock.AcquireAsync(key, cancellationToken);
                cachedValue = await ReadAsync();
                if (cachedValue is not null) { Record("hit"); return cachedValue; }
            }
            Record(readFailed ? "error" : cache is Reliability.ResilientCache { WasBypassed: true } ? "bypass" : "miss");
            var result = await factory(cancellationToken);
            try
            {
                await cache.SetStringAsync(key, JsonSerializer.Serialize(result, JsonOptions),
                    new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl }, cancellationToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                PerformanceMetrics.CacheWritesFailed.Add(1, new KeyValuePair<string, object?>("cache.kind", kind));
                logger.LogWarning(exception, "Could not write public content cache key {CacheKey}; returning database result", key);
            }
            return result;
        }
        finally { lease?.Dispose(); }
    }

    private async Task<string> GetVersionAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            if (pending.TryGet(key, out var generation))
            {
                await cache.SetStringAsync(key, Guid.NewGuid().ToString("N"),
                    new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromDays(7) }, cancellationToken);
                pending.Complete(key, generation);
            }
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
        var generation = pending.Mark(key);
        try
        {
            await cache.SetStringAsync(
                key,
                Guid.NewGuid().ToString("N"),
                new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromDays(7) },
                cancellationToken);
            pending.Complete(key, generation);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Could not invalidate public content cache version {CacheKey}; database mutation remains committed", key);
        }
    }
}
