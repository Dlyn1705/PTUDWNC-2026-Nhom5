using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace CulinaryBlog.Infrastructure.Services.Reliability;

// Scoped: capture the committed database epoch before reading data. A concurrent mutation
// can only make this scope's writes unreachable; it cannot put old data into the new epoch.
public sealed class ResilientCache(IDistributedCache transport, string connectionString,
    ILogger<ResilientCache> logger, int timeoutMs = 300) : IDistributedCache
{
    private string? epoch;
    private bool bypass;
    private async Task<string> Key(string key, CancellationToken ct)
    {
        if (epoch is null)
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(ct);
            await using var command = new NpgsqlCommand("SELECT generation::text FROM public.cache_epoch WHERE id = 1", connection);
            command.CommandTimeout = 2;
            epoch = (string?)await command.ExecuteScalarAsync(ct) ?? throw new InvalidOperationException("Cache epoch missing");
        }
        return $"epoch:{epoch}:{key}";
    }

    private async Task<T> Attempt<T>(Func<CancellationToken, Task<T>> action, T fallback, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        if (bypass) return fallback;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(timeoutMs);
        try { return await action(deadline.Token).WaitAsync(TimeSpan.FromMilliseconds(timeoutMs), ct); }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            bypass = true;
            logger.LogWarning("Cache unavailable; using database for this scope");
            return fallback;
        }
    }

    public Task<byte[]?> GetAsync(string key, CancellationToken token = default) =>
        Attempt(async ct => await transport.GetAsync(await Key(key, ct), ct), (byte[]?)null, token);
    public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) =>
        Attempt(async ct => { await transport.SetAsync(await Key(key, ct), value, options, ct); return true; }, false, token);
    public Task RemoveAsync(string key, CancellationToken token = default) =>
        Attempt(async ct => { await transport.RemoveAsync(await Key(key, ct), ct); return true; }, false, token);
    public Task RefreshAsync(string key, CancellationToken token = default) =>
        Attempt(async ct => { await transport.RefreshAsync(await Key(key, ct), ct); return true; }, false, token);
    public byte[]? Get(string key) => GetAsync(key).GetAwaiter().GetResult();
    public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => SetAsync(key, value, options).GetAwaiter().GetResult();
    public void Remove(string key) => RemoveAsync(key).GetAwaiter().GetResult();
    public void Refresh(string key) => RefreshAsync(key).GetAwaiter().GetResult();
}
