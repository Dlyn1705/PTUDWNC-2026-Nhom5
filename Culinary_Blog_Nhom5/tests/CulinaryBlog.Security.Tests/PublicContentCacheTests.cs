using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CulinaryBlog.Security.Tests;

public sealed class PublicContentCacheTests
{
    [Fact]
    public async Task Category_list_is_cached_and_version_invalidation_forces_a_reload()
    {
        var services = new ServiceCollection().AddDistributedMemoryCache().BuildServiceProvider();
        var cache = new PublicContentCache(
            services.GetRequiredService<IDistributedCache>(),
            NullLogger<PublicContentCache>.Instance);
        var calls = 0;

        Task<IReadOnlyList<CategoryDto>> Factory(CancellationToken _)
        {
            calls++;
            return Task.FromResult<IReadOnlyList<CategoryDto>>([
                new CategoryDto { Id = Guid.NewGuid(), Name = "Món Việt", Slug = "mon-viet" }
            ]);
        }

        var first = await cache.GetCategoriesAsync(Factory);
        var second = await cache.GetCategoriesAsync(Factory);

        Assert.Equal(1, calls);
        Assert.Equal(first[0].Id, second[0].Id);

        await cache.InvalidateCategoriesAsync();
        await cache.GetCategoriesAsync(Factory);

        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task Redis_failure_falls_back_to_factory_without_failing_the_request()
    {
        var cache = new PublicContentCache(
            new ThrowingDistributedCache(),
            NullLogger<PublicContentCache>.Instance);

        var result = await cache.GetCategoriesAsync(_ =>
            Task.FromResult<IReadOnlyList<CategoryDto>>([
                new CategoryDto { Id = Guid.NewGuid(), Name = "Fallback", Slug = "fallback" }
            ]));

        Assert.Single(result);
        await cache.InvalidateCategoriesAsync();
    }

    [Fact]
    public async Task Cached_paged_recipe_result_round_trips_data_and_metadata()
    {
        var services = new ServiceCollection().AddDistributedMemoryCache().BuildServiceProvider();
        var cache = new PublicContentCache(
            services.GetRequiredService<IDistributedCache>(),
            NullLogger<PublicContentCache>.Instance);
        var calls = 0;
        var item = new RecipeSummaryDto { Title = "Cached recipe", Slug = "cached-recipe" };

        Task<PagedResult<RecipeSummaryDto>> Factory(CancellationToken _)
        {
            calls++;
            return Task.FromResult(new PagedResult<RecipeSummaryDto>([item], 1, 1, 12));
        }

        var first = await cache.GetRecipesAsync("1:12::::createdAt:desc", Factory);
        var second = await cache.GetRecipesAsync("1:12::::createdAt:desc", Factory);

        Assert.Equal(1, calls);
        Assert.Single(second.Data);
        Assert.Equal("Cached recipe", second.Data[0].Title);
        Assert.Equal(1, second.Meta.TotalCount);
        Assert.Equal(1, second.Meta.TotalPages);
        Assert.Equal(first.Meta.PageSize, second.Meta.PageSize);
    }

    [Fact]
    public async Task Recipe_mutation_invalidates_both_recipe_and_category_versions()
    {
        var services = new ServiceCollection().AddDistributedMemoryCache().BuildServiceProvider();
        var distributedCache = services.GetRequiredService<IDistributedCache>();
        var publicCache = new PublicContentCache(distributedCache, NullLogger<PublicContentCache>.Instance);
        var invalidator = new RecipeCacheInvalidator(
            distributedCache,
            publicCache,
            NullLogger<RecipeCacheInvalidator>.Instance);

        var recipeCalls = 0;
        var categoryCalls = 0;
        var recipeId = Guid.NewGuid();
        var slug = "pho-bo-ha-noi";

        Task<PagedResult<RecipeSummaryDto>> RecipeFactory(CancellationToken _)
        {
            recipeCalls++;
            return Task.FromResult(new PagedResult<RecipeSummaryDto>([
                new RecipeSummaryDto { Id = recipeId, Title = "Phở Bò Hà Nội", Slug = slug }
            ], 1, 1, 12));
        }

        Task<IReadOnlyList<CategoryDto>> CategoryFactory(CancellationToken _)
        {
            categoryCalls++;
            return Task.FromResult<IReadOnlyList<CategoryDto>>([
                new CategoryDto { Id = Guid.NewGuid(), Name = "Món Nước", Slug = "mon-nuoc", RecipeCount = 5 }
            ]);
        }

        // Initial populate
        await publicCache.GetRecipesAsync("1:12::::createdAt:desc", RecipeFactory);
        await publicCache.GetCategoriesAsync(CategoryFactory);
        Assert.Equal(1, recipeCalls);
        Assert.Equal(1, categoryCalls);

        // Second fetch hits cache
        await publicCache.GetRecipesAsync("1:12::::createdAt:desc", RecipeFactory);
        await publicCache.GetCategoriesAsync(CategoryFactory);
        Assert.Equal(1, recipeCalls);
        Assert.Equal(1, categoryCalls);

        // Perform mutation invalidation (e.g. Recipe published, archived, deleted or image changed)
        await invalidator.InvalidateRecipeAsync(recipeId, slug);

        // Subsequent fetch must trigger reload for both public recipe list and category projection
        await publicCache.GetRecipesAsync("1:12::::createdAt:desc", RecipeFactory);
        await publicCache.GetCategoriesAsync(CategoryFactory);
        Assert.Equal(2, recipeCalls);
        Assert.Equal(2, categoryCalls);
    }

    [Fact]
    public async Task Recipe_detail_is_cached_and_reloaded_after_invalidation()
    {
        var services = new ServiceCollection().AddDistributedMemoryCache().BuildServiceProvider();
        var distributedCache = services.GetRequiredService<IDistributedCache>();
        var publicCache = new PublicContentCache(distributedCache, NullLogger<PublicContentCache>.Instance);
        var invalidator = new RecipeCacheInvalidator(
            distributedCache,
            publicCache,
            NullLogger<RecipeCacheInvalidator>.Instance);

        var calls = 0;
        var recipeId = Guid.NewGuid();
        var slug = "bun-cha-ha-noi";

        Task<RecipeDetailDto> Factory(CancellationToken _)
        {
            calls++;
            return Task.FromResult(new RecipeDetailDto
            {
                Id = recipeId,
                Title = "Bún Chả Hà Nội",
                Slug = slug,
                Description = "Đặc sản bún chả",
                Status = 1
            });
        }

        var first = await publicCache.GetRecipeAsync(slug, Factory);
        var second = await publicCache.GetRecipeAsync(slug, Factory);

        Assert.Equal(1, calls);
        Assert.Equal("Bún Chả Hà Nội", second.Title);

        await invalidator.InvalidateRecipeAsync(recipeId, slug);
        var third = await publicCache.GetRecipeAsync(slug, Factory);

        Assert.Equal(2, calls);
        Assert.Equal(first.Id, third.Id);
    }

    [Fact]
    public async Task Redis_write_failure_gracefully_returns_factory_result()
    {
        var cache = new PublicContentCache(
            new FailingWriteDistributedCache(),
            NullLogger<PublicContentCache>.Instance);

        var calls = 0;
        var result = await cache.GetRecipeAsync("test-slug", _ =>
        {
            calls++;
            return Task.FromResult(new RecipeDetailDto { Title = "Resilient Item", Slug = "test-slug" });
        });

        Assert.Equal(1, calls);
        Assert.Equal("Resilient Item", result.Title);
    }

    private sealed class ThrowingDistributedCache : IDistributedCache
    {
        private static Exception Failure() => new InvalidOperationException("Redis unavailable");

        public byte[]? Get(string key) => throw Failure();
        public Task<byte[]?> GetAsync(string key, CancellationToken token = default) => throw Failure();
        public void Refresh(string key) => throw Failure();
        public Task RefreshAsync(string key, CancellationToken token = default) => throw Failure();
        public void Remove(string key) => throw Failure();
        public Task RemoveAsync(string key, CancellationToken token = default) => throw Failure();
        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => throw Failure();
        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) => throw Failure();
    }

    private sealed class FailingWriteDistributedCache : IDistributedCache
    {
        public byte[]? Get(string key) => null;
        public Task<byte[]?> GetAsync(string key, CancellationToken token = default) => Task.FromResult<byte[]?>(null);
        public void Refresh(string key) {}
        public Task RefreshAsync(string key, CancellationToken token = default) => Task.CompletedTask;
        public void Remove(string key) {}
        public Task RemoveAsync(string key, CancellationToken token = default) => Task.CompletedTask;
        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => throw new InvalidOperationException("Write quota exceeded / Redis offline");
        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) => throw new InvalidOperationException("Write quota exceeded / Redis offline");
    }
}
