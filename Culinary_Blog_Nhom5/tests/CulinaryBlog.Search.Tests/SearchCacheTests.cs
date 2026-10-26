using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace CulinaryBlog.Search.Tests;

public sealed class SearchCacheTests
{
    [Fact]
    public async Task Search_cache_roundtrips_and_invalidates_for_recipe_and_category_changes()
    {
        var storage = new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions()));
        var cache = new PublicContentCache(storage, NullLogger<PublicContentCache>.Instance);
        int calls = 0;
        Task<PagedResult<SearchRecipeSummaryDto>> Load(CancellationToken _) {
            calls++;
            return Task.FromResult(new PagedResult<SearchRecipeSummaryDto>([new() { Title = "Phở" }], 25, 2, 12));
        }
        await cache.GetSearchAsync("pho:2:12", Load);
        var hit = await cache.GetSearchAsync("pho:2:12", Load);
        Assert.Equal(1, calls); Assert.Equal("Phở", Assert.Single(hit.Data).Title);
        Assert.Equal(25, hit.Meta.TotalCount); Assert.Equal(2, hit.Meta.Page);
        await cache.GetSearchAsync("pho:3:12", Load); Assert.Equal(2, calls);
        await cache.InvalidateRecipesAsync();
        await cache.GetSearchAsync("pho:2:12", Load); Assert.Equal(3, calls);
        await cache.InvalidateCategoriesAsync();
        await cache.GetSearchAsync("pho:2:12", Load); Assert.Equal(4, calls);
    }

    [Fact]
    public async Task Cache_outage_does_not_hide_database_results()
    {
        var cache = new PublicContentCache(new OfflineCache(), NullLogger<PublicContentCache>.Instance);
        var result = await cache.GetSearchAsync("pho", _ => Task.FromResult(new PagedResult<SearchRecipeSummaryDto>([new() { Title = "Phở" }], 1, 1, 12)));
        Assert.Single(result.Data);
    }

    private sealed class OfflineCache : IDistributedCache
    {
        public byte[]? Get(string key) => throw new IOException("Offline");
        public Task<byte[]?> GetAsync(string key, CancellationToken token = default) => throw new IOException("Offline");
        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => throw new IOException("Offline");
        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) => throw new IOException("Offline");
        public void Refresh(string key) => throw new IOException("Offline");
        public Task RefreshAsync(string key, CancellationToken token = default) => throw new IOException("Offline");
        public void Remove(string key) => throw new IOException("Offline");
        public Task RemoveAsync(string key, CancellationToken token = default) => throw new IOException("Offline");
    }
}
