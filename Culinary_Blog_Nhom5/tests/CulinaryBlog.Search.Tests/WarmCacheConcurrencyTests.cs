using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace CulinaryBlog.Search.Tests;

public sealed class WarmCacheConcurrencyTests
{
    [Fact]
    public async Task Warm_reads_of_the_same_key_do_not_serialize_transport_io()
    {
        var transport = new ReadBarrierCache();
        var cache = new PublicContentCache(transport, NullLogger<PublicContentCache>.Instance);
        await cache.GetSearchAsync("warm-parallel", _ => Task.FromResult(new PagedResult<SearchRecipeSummaryDto>([new() { Title = "Phở" }], 1, 1, 12)));
        transport.BarrierEnabled = true;
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        Task<PagedResult<SearchRecipeSummaryDto>> Read() => cache.GetSearchAsync("warm-parallel",
            _ => throw new Exception("Warm data must not reload"), deadline.Token);
        var results = await Task.WhenAll(Read(), Read());
        Assert.Equal(2, transport.ConcurrentReads);
        Assert.All(results, r => Assert.Equal("Phở", Assert.Single(r.Data).Title));
    }

    private sealed class ReadBarrierCache : IDistributedCache
    {
        private readonly MemoryDistributedCache inner = new(Options.Create(new MemoryDistributedCacheOptions()));
        private readonly TaskCompletionSource bothStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int reads;
        public bool BarrierEnabled;
        public int ConcurrentReads => reads;
        public async Task<byte[]?> GetAsync(string key, CancellationToken token = default)
        {
            if (BarrierEnabled && key.Contains(":search:"))
            {
                if (Interlocked.Increment(ref reads) == 2) bothStarted.SetResult();
                await bothStarted.Task.WaitAsync(token);
            }
            return await inner.GetAsync(key, token);
        }
        public byte[]? Get(string key) => inner.Get(key);
        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => inner.Set(key, value, options);
        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) => inner.SetAsync(key, value, options, token);
        public void Refresh(string key) => inner.Refresh(key);
        public Task RefreshAsync(string key, CancellationToken token = default) => inner.RefreshAsync(key, token);
        public void Remove(string key) => inner.Remove(key);
        public Task RemoveAsync(string key, CancellationToken token = default) => inner.RemoveAsync(key, token);
    }
}
