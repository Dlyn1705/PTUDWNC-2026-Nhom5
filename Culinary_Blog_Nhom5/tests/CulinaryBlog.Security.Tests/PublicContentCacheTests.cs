using CulinaryBlog.Application.DTOs;
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
}
