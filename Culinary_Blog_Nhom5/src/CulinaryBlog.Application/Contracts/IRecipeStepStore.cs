using CulinaryBlog.Application.Features.Recipes.Steps;

namespace CulinaryBlog.Application.Contracts;

public interface IRecipeStepStore
{
    Task<StepSnapshot> ReadAsync(Guid recipeId, CancellationToken ct);
    Task<StepSnapshot> MutateAsync(StepMutation mutation, CancellationToken ct);
    Task<RecipePublishResult> PublishAsync(Guid recipeId, CancellationToken ct);
}
