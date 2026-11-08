using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace CulinaryBlog.Search.Tests;

public sealed class SearchCacheConcurrencyTests
{
    private static PublicContentCache Create() => new(
        new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions())),
        NullLogger<PublicContentCache>.Instance);
    private static PagedResult<SearchRecipeSummaryDto> Result() => new([new() { Title = "Phở" }], 1, 1, 12);

    [Fact]
    public async Task One_hundred_identical_cold_searches_only_load_the_database_once()
    {
        var cache = Create(); var calls = 0;
        async Task<PagedResult<SearchRecipeSummaryDto>> Load(CancellationToken ct)
        {
            Interlocked.Increment(ref calls); await Task.Delay(50, ct); return Result();
        }
        var results = await Task.WhenAll(Enumerable.Range(0, 100).Select(_ => cache.GetSearchAsync("concurrent-identical", Load)));
        Assert.Equal(1, calls);
        Assert.All(results, result => Assert.Equal("Phở", Assert.Single(result.Data).Title));
        await cache.InvalidateRecipesAsync();
        await cache.GetSearchAsync("concurrent-identical", Load);
        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task Different_queries_are_not_serialized()
    {
        var cache = Create(); var started = 0;
        var bothStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<PagedResult<SearchRecipeSummaryDto>> Load(CancellationToken ct)
        {
            if (Interlocked.Increment(ref started) == 2) bothStarted.SetResult();
            await bothStarted.Task.WaitAsync(TimeSpan.FromSeconds(5), ct);
            return Result();
        }
        await Task.WhenAll(cache.GetSearchAsync("independent-a", Load), cache.GetSearchAsync("independent-b", Load));
        Assert.Equal(2, started);
    }

    [Fact]
    public async Task Cancelled_waiter_does_not_cancel_owner_or_poison_the_key()
    {
        var cache = Create();
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var owner = cache.GetSearchAsync("cancelled-waiter", async ct => { started.SetResult(); await release.Task.WaitAsync(ct); return Result(); });
        await started.Task;
        using var cancellation = new CancellationTokenSource();
        var waiter = cache.GetSearchAsync("cancelled-waiter", _ => throw new InvalidOperationException("Must use cached result"), cancellation.Token);
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => waiter);
        release.SetResult(); await owner;
        Assert.Single((await cache.GetSearchAsync("cancelled-waiter", _ => throw new InvalidOperationException("Must use cached result"))).Data);
    }

    [Fact]
    public async Task Failed_loader_releases_the_key_for_a_retry()
    {
        var cache = Create();
        await Assert.ThrowsAsync<IOException>(() => cache.GetSearchAsync("failed-loader", _ => throw new IOException("Database failure")));
        Assert.Single((await cache.GetSearchAsync("failed-loader", _ => Task.FromResult(Result()))).Data);
    }
}
