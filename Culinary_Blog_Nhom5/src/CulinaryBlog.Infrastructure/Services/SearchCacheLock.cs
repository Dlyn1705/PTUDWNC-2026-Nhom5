namespace CulinaryBlog.Infrastructure.Services;

/// <summary>Coalesces identical searches in this process; idle keys are removed immediately.</summary>
internal static class SearchCacheLock
{
    private sealed class Entry
    {
        public readonly SemaphoreSlim Gate = new(1, 1);
        public int Users;
    }

    private static readonly Dictionary<string, Entry> Entries = new(StringComparer.Ordinal);

    public static async Task<IDisposable> AcquireAsync(string key, CancellationToken cancellationToken)
    {
        Entry entry;
        lock (Entries)
        {
            if (!Entries.TryGetValue(key, out entry!)) Entries[key] = entry = new Entry();
            entry.Users++;
        }
        try
        {
            await entry.Gate.WaitAsync(cancellationToken);
            return new Lease(key, entry);
        }
        catch
        {
            RemoveUser(key, entry);
            throw;
        }
    }

    private static void RemoveUser(string key, Entry entry)
    {
        lock (Entries)
        {
            if (--entry.Users == 0)
            {
                Entries.Remove(key);
                entry.Gate.Dispose();
            }
        }
    }

    private sealed class Lease(string key, Entry entry) : IDisposable
    {
        private int disposed;
        public void Dispose()
        {
            if (Interlocked.Exchange(ref disposed, 1) != 0) return;
            entry.Gate.Release();
            RemoveUser(key, entry);
        }
    }
}
