using System.Diagnostics.Metrics;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace CulinaryBlog.Search.Tests;

public sealed class PerformanceCacheTests
{
    [Fact]
    public async Task Configured_ttl_is_applied_to_data_and_invalidation_prevents_stale_reads()
    {
        var transport = new RecordingCache();
        var cache = new PublicContentCache(transport, NullLogger<PublicContentCache>.Instance,
            options: Options.Create(new PublicCacheOptions { DetailMinutes = 17 }));
        var title = "before"; var calls = 0;
        Task<RecipeDetailDto> Load(CancellationToken _) { calls++; return Task.FromResult(new RecipeDetailDto { Title = title }); }
        await cache.GetRecipeAsync("test", Load);
        Assert.Equal(TimeSpan.FromMinutes(17), transport.DataTtl);
        title = "after";
        Assert.Equal("before", (await cache.GetRecipeAsync("test", Load)).Title);
        Assert.Equal(1, calls);
        await cache.InvalidateRecipesAsync();
        Assert.Equal("after", (await cache.GetRecipeAsync("test", Load)).Title);
        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task Read_outage_records_error_and_cancellation_does_not_load_database()
    {
        var outcomes = new System.Collections.Concurrent.ConcurrentBag<string>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, l) => { if (instrument.Name == "public.cache.reads") l.EnableMeasurementEvents(instrument); };
        listener.SetMeasurementEventCallback<long>((_, _, tags, _) => {
            foreach (var tag in tags) if (tag.Key == "cache.outcome") outcomes.Add((string)tag.Value!);
        });
        listener.Start();
        var transport = new RecordingCache { Offline = true };
        var cache = new PublicContentCache(transport, NullLogger<PublicContentCache>.Instance);
        var result = await cache.GetRecipeAsync("offline", _ => Task.FromResult(new RecipeDetailDto { Title = "database" }));
        Assert.Equal("database", result.Title); Assert.Contains("error", outcomes);
        transport.Offline = false;
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => cache.GetRecipeAsync("canceled",
            _ => throw new Exception("Database must not be loaded"), cancellation.Token));
    }

    private sealed class RecordingCache : IDistributedCache
    {
        private readonly MemoryDistributedCache inner = new(Options.Create(new MemoryDistributedCacheOptions()));
        public TimeSpan? DataTtl; public bool Offline;
        public byte[]? Get(string key) => inner.Get(key);
        public Task<byte[]?> GetAsync(string key, CancellationToken token = default)
        { token.ThrowIfCancellationRequested(); if (Offline) throw new IOException("offline"); return inner.GetAsync(key, token); }
        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => inner.Set(key, value, options);
        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default)
        { if (Offline) throw new IOException("offline"); if (key.Contains(":detail:")) DataTtl = options.AbsoluteExpirationRelativeToNow; return inner.SetAsync(key, value, options, token); }
        public void Refresh(string key) => inner.Refresh(key);
        public Task RefreshAsync(string key, CancellationToken token = default) => inner.RefreshAsync(key, token);
        public void Remove(string key) => inner.Remove(key);
        public Task RemoveAsync(string key, CancellationToken token = default) => inner.RemoveAsync(key, token);
    }
}
