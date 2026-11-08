using System.Collections.Concurrent;

namespace CulinaryBlog.Infrastructure.Services;

/// <summary>Retry failed invalidations before this instance reads a recovered Redis cache.</summary>
public sealed class PendingPublicCacheInvalidations
{
    private readonly ConcurrentDictionary<string, long> pending = new();
    private long sequence;
    public long Mark(string key) { var version = Interlocked.Increment(ref sequence); pending[key] = version; return version; }
    public bool TryGet(string key, out long version) => pending.TryGetValue(key, out version);
    public void Complete(string key, long version) => pending.TryRemove(new KeyValuePair<string, long>(key, version));
}
