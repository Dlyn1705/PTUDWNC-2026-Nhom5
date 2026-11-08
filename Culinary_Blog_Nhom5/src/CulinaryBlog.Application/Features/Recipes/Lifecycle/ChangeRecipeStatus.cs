using CulinaryBlog.Domain.Enums;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Lifecycle;

public enum RecipeLifecycleOperation { Unpublish, Archive, Unarchive }
public sealed record RecipeLifecycleResult(Guid Id, RecipeStatus Status, DateTime? PublishedAt, DateTime? UpdatedAt);
public sealed record ChangeRecipeStatusCommand(Guid RecipeId, RecipeLifecycleOperation Operation) : IRequest<RecipeLifecycleResult>;
public interface IRecipeLifecycleStore
{
    Task<RecipeLifecycleResult> ChangeAsync(Guid recipeId, RecipeLifecycleOperation operation, CancellationToken ct);
}
public sealed class ChangeRecipeStatusHandler(IRecipeLifecycleStore store)
    : IRequestHandler<ChangeRecipeStatusCommand, RecipeLifecycleResult>
{
    // Store authorizes against the locked recipe, including calls outside HTTP.
    public Task<RecipeLifecycleResult> Handle(ChangeRecipeStatusCommand request, CancellationToken ct) =>
        store.ChangeAsync(request.RecipeId, request.Operation, ct);
}
