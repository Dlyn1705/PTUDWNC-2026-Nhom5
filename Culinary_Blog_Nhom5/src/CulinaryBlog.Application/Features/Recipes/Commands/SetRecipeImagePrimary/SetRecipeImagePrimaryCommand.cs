using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeImages;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Commands.SetRecipeImagePrimary;

public sealed record SetRecipeImagePrimaryCommand(Guid RecipeId, Guid ImageId) : IRequest<RecipeImageDto>;

public sealed class SetRecipeImagePrimaryCommandHandler(
    IRecipeRepository recipes, ICurrentUserService user, IRecipeImageMutations mutations)
    : IRequestHandler<SetRecipeImagePrimaryCommand, RecipeImageDto>
{
    public async Task<RecipeImageDto> Handle(SetRecipeImagePrimaryCommand request, CancellationToken ct)
    {
        var recipe = await recipes.GetDetailsByIdAsync(request.RecipeId, ct)
            ?? throw new NotFoundException("Recipe", request.RecipeId);
        RecipeImageAccess.EnsureOwner(recipe, user);
        return RecipeImageAccess.ToDto(await mutations.SetPrimaryAsync(request.RecipeId, request.ImageId, ct));
    }
}
