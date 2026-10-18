namespace CulinaryBlog.Application.Contracts;

/// <summary>
/// Invalidates public recipe cache entries after a committed recipe mutation.
/// Implementations must degrade gracefully when the cache is unavailable.
/// </summary>
public interface IRecipeCacheInvalidator
{
    Task InvalidateRecipeAsync(Guid recipeId, string? slug, CancellationToken cancellationToken = default);
}
