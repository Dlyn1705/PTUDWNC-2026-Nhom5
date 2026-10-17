using CulinaryBlog.Domain.Entities;

namespace CulinaryBlog.Application.Contracts;

/// <summary>Serializes gallery changes for one recipe; rechecks access inside the transaction.</summary>
public interface IRecipeImageMutations
{
    Task AddAsync(RecipeImage image, CancellationToken ct);
    Task<RecipeImage> SetPrimaryAsync(Guid recipeId, Guid imageId, CancellationToken ct);
    Task DeleteAsync(Guid recipeId, Guid imageId, CancellationToken ct);
}
