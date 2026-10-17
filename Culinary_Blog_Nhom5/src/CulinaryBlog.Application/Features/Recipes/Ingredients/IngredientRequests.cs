using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Ingredients;

public sealed record GetRecipeIngredientsQuery(Guid RecipeId) : IRequest<IngredientSnapshot>;
public sealed record ChangeRecipeIngredientsCommand(IngredientMutation Mutation) : IRequest<IngredientSnapshot>;

public sealed class IngredientRequestsHandler(IRecipeRepository recipes, ICurrentUserService user,
    IRecipeIngredientStore store) : IRequestHandler<GetRecipeIngredientsQuery, IngredientSnapshot>,
    IRequestHandler<ChangeRecipeIngredientsCommand, IngredientSnapshot>
{
    private async Task AuthorizeAsync(Guid recipeId, CancellationToken ct)
    {
        var recipe = await recipes.GetDetailsByIdAsync(recipeId, ct)
            ?? throw new NotFoundException("Recipe", recipeId);
        IngredientRules.EnsureOwner(recipe, user);
    }

    public async Task<IngredientSnapshot> Handle(GetRecipeIngredientsQuery request, CancellationToken ct)
    {
        await AuthorizeAsync(request.RecipeId, ct);
        return await store.ReadAsync(request.RecipeId, ct);
    }

    public async Task<IngredientSnapshot> Handle(ChangeRecipeIngredientsCommand request, CancellationToken ct)
    {
        await AuthorizeAsync(request.Mutation.RecipeId, ct);
        if (request.Mutation.Operation is IngredientOperation.Add or IngredientOperation.Update)
        {
            if (request.Mutation.Input is null) throw new ValidationException("ingredient", "Thiếu dữ liệu nguyên liệu.");
            IngredientRules.Validate(request.Mutation.Input);
        }
        if (request.Mutation.ExpectedVersion is not { Length: 16 })
            throw new ValidationException("If-Match", "Version của công thức không hợp lệ.");
        return await store.MutateAsync(request.Mutation, ct);
    }
}
