using CulinaryBlog.Application.Features.Recipes.Ingredients;

namespace CulinaryBlog.Application.Contracts;

public interface IRecipeIngredientStore
{
    Task<IngredientSnapshot> ReadAsync(Guid recipeId, CancellationToken ct);
    Task<IngredientSnapshot> MutateAsync(IngredientMutation mutation, CancellationToken ct);
}
