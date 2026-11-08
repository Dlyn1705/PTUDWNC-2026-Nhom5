using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Steps;

public sealed record GetRecipeStepsQuery(Guid RecipeId) : IRequest<StepSnapshot>;
public sealed record ChangeRecipeStepsCommand(StepMutation Mutation) : IRequest<StepSnapshot>;
public sealed record PublishRecipeWithStepsCommand(Guid RecipeId) : IRequest<RecipePublishResult>;

public sealed class StepRequestsHandler(IRecipeRepository recipes, ICurrentUserService user, IRecipeStepStore store)
    : IRequestHandler<GetRecipeStepsQuery, StepSnapshot>, IRequestHandler<ChangeRecipeStepsCommand, StepSnapshot>,
      IRequestHandler<PublishRecipeWithStepsCommand, RecipePublishResult>
{
    private async Task Authorize(Guid recipeId, CancellationToken ct)
    {
        var recipe = await recipes.GetByIdAsync(recipeId, ct) ?? throw new NotFoundException("Recipe", recipeId);
        StepRules.EnsureOwner(recipe, user);
    }

    public async Task<StepSnapshot> Handle(GetRecipeStepsQuery request, CancellationToken ct)
    { await Authorize(request.RecipeId, ct); return await store.ReadAsync(request.RecipeId, ct); }

    public async Task<StepSnapshot> Handle(ChangeRecipeStepsCommand request, CancellationToken ct)
    {
        var mutation = request.Mutation;
        await Authorize(mutation.RecipeId, ct);
        if (mutation.ExpectedVersion is not { Length: 16 }) throw new ValidationException("If-Match", "Cần ETag Recipe hiện tại.");
        if (mutation.Operation is StepOperation.Add or StepOperation.Update)
            StepRules.Validate(mutation.Input ?? throw new ValidationException("step", "Thiếu dữ liệu bước."));
        if (mutation.Operation == StepOperation.Add) mutation = mutation with { StepId = Guid.NewGuid() };
        return await store.MutateAsync(mutation, ct);
    }

    public async Task<RecipePublishResult> Handle(PublishRecipeWithStepsCommand request, CancellationToken ct)
    { await Authorize(request.RecipeId, ct); return await store.PublishAsync(request.RecipeId, ct); }
}
