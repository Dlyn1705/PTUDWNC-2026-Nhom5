namespace CulinaryBlog.Application.Contracts;

/// <summary>
/// Best-effort bridge from committed backend mutations to the Next.js ISR cache.
/// Implementations must never turn a successful database mutation into a 5xx.
/// </summary>
public interface IFrontendRevalidationClient
{
    Task RevalidateAsync(
        IReadOnlyCollection<string> tags,
        IReadOnlyCollection<string> paths,
        CancellationToken cancellationToken = default);
}
