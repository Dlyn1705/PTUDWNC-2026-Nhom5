using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Caching.StackExchangeRedis;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace CulinaryBlog.Observability.Tests;

public sealed class PublicCacheRecoveryTests
{
    [Fact]
    public async Task Failed_invalidation_is_repaired_before_reading_a_recovered_cache_across_scopes()
    {
        IDistributedCache backing = Environment.GetEnvironmentVariable("ISSUE83_REDIS_URL") is { Length: > 0 } url
            ? new RedisCache(Options.Create(new RedisCacheOptions { Configuration = url, InstanceName = "issue83-test:" + Guid.NewGuid().ToString("N") + ":" }))
            : new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions()));
        var fault = new WriteFaultCache(backing);
        try
        {
            var pending = new PendingPublicCacheInvalidations();
            PublicContentCache Scoped() => new(fault, NullLogger<PublicContentCache>.Instance, pending);
            var published = true; var calls = 0;
            Task<PagedResult<SearchRecipeSummaryDto>> Load(CancellationToken _)
            {
                calls++;
                return Task.FromResult(new PagedResult<SearchRecipeSummaryDto>(published ? [new() { Title = "Phở" }] : [], published ? 1 : 0, 1, 12));
            }
            Assert.Single((await Scoped().GetSearchAsync("pho", Load)).Data);
            await Scoped().GetSearchAsync("pho", Load); Assert.Equal(1, calls);
            published = false; fault.FailWrites = true;
            await Scoped().InvalidateRecipesAsync(); // mutation commits, Redis invalidation fails
            Assert.Empty((await Scoped().GetSearchAsync("pho", Load)).Data); // failure still bypasses stale key
            fault.FailWrites = false;
            Assert.Empty((await Scoped().GetSearchAsync("pho", Load)).Data); // repair precedes cache read
            Assert.Equal(3, calls);
            await Scoped().GetSearchAsync("pho", Load); Assert.Equal(3, calls);
        }
        finally
        {
            fault.FailWrites = false;
            foreach (var key in fault.Keys) await backing.RemoveAsync(key);
            (backing as IDisposable)?.Dispose();
        }
    }

    [Fact]
    public void Old_invalidation_completion_cannot_clear_a_newer_generation()
    {
        var pending = new PendingPublicCacheInvalidations(); var old = pending.Mark("recipes"); var latest = pending.Mark("recipes");
        pending.Complete("recipes", old); Assert.True(pending.TryGet("recipes", out var actual)); Assert.Equal(latest, actual);
        pending.Complete("recipes", latest); Assert.False(pending.TryGet("recipes", out _));
    }

    private sealed class WriteFaultCache(IDistributedCache inner) : IDistributedCache
    {
        public bool FailWrites { get; set; }
        public HashSet<string> Keys { get; } = [];
        public byte[]? Get(string key) => inner.Get(key);
        public Task<byte[]?> GetAsync(string key, CancellationToken token = default) => inner.GetAsync(key, token);
        public void Refresh(string key) => inner.Refresh(key);
        public Task RefreshAsync(string key, CancellationToken token = default) => inner.RefreshAsync(key, token);
        public void Remove(string key) { if (FailWrites) throw new IOException("test Redis unavailable"); inner.Remove(key); }
        public Task RemoveAsync(string key, CancellationToken token = default) { if (FailWrites) throw new IOException("test Redis unavailable"); return inner.RemoveAsync(key, token); }
        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) { if (FailWrites) throw new IOException("test Redis unavailable"); Keys.Add(key); inner.Set(key, value, options); }
        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) {
            if (FailWrites) throw new IOException("test Redis unavailable"); Keys.Add(key); return inner.SetAsync(key, value, options, token);
        }
    }
}
