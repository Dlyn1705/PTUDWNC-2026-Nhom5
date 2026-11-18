using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Queries.ResolveRecipeSlug;

public sealed record RecipeSlugResolutionDto(string CurrentSlug, bool Redirected);
public sealed record ResolveRecipeSlugQuery(string Slug) : IRequest<RecipeSlugResolutionDto>;

public sealed class ResolveRecipeSlugQueryHandler(IRecipeRepository recipes)
    : IRequestHandler<ResolveRecipeSlugQuery, RecipeSlugResolutionDto>
{
    public async Task<RecipeSlugResolutionDto> Handle(
        ResolveRecipeSlugQuery request, CancellationToken cancellationToken)
    {
        var recipe = await recipes.GetPublishedBySlugHistoryAsync(request.Slug, cancellationToken)
            ?? throw new NotFoundException("Recipe", request.Slug);
        return new RecipeSlugResolutionDto(recipe.Slug, true);
    }
}
