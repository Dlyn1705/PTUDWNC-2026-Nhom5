using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeBySlug;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeById;

public sealed record GetRecipeByIdQuery(Guid Id) : IRequest<RecipeDetailDto>;

public sealed class GetRecipeByIdQueryHandler(
    IRecipeRepository recipes,
    ICurrentUserService currentUser) : IRequestHandler<GetRecipeByIdQuery, RecipeDetailDto>
{
    public async Task<RecipeDetailDto> Handle(GetRecipeByIdQuery request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated)
            throw new UnauthorizedAccessException("Authentication required.");

        var recipe = await recipes.GetDetailsByIdAsync(request.Id, cancellationToken);
        if (recipe is null || recipe.IsDeleted)
            throw new NotFoundException("Recipe", request.Id);

        if (!currentUser.IsAdmin
            && !string.Equals(recipe.AuthorId, currentUser.UserId, StringComparison.Ordinal))
        {
            throw new ForbiddenException("Only the recipe owner or an administrator can read a recipe by ID.");
        }

        return GetRecipeBySlugQueryHandler.MapRecipe(recipe);
    }
}
