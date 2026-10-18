using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipe;

public sealed class DeleteRecipeCommandHandler(
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUser,
    IRecipeCacheInvalidator cacheInvalidator) : IRequestHandler<DeleteRecipeCommand>
{
    public async Task Handle(DeleteRecipeCommand request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || string.IsNullOrWhiteSpace(currentUser.UserId)
            || (!currentUser.IsAdmin && !currentUser.Roles.Contains("Author")))
            throw new ForbiddenException("Chỉ tác giả hoặc Admin mới được xóa công thức.");

        // Do not include required Category navigation: a deleted category must not
        // prevent its owner from deleting the recipe. No child/image mutation here.
        var recipe = await unitOfWork.Recipes.GetByIdAsync(request.RecipeId, cancellationToken)
            ?? throw new NotFoundException("Recipe", request.RecipeId);

        if (recipe.IsDeleted) throw new NotFoundException("Recipe", request.RecipeId);

        if (!currentUser.IsAdmin
            && !string.Equals(recipe.AuthorId, currentUser.UserId, StringComparison.Ordinal))
        {
            throw new ForbiddenException("Chỉ chủ sở hữu công thức hoặc Admin mới được xóa công thức.");
        }

        recipe.SoftDelete();
        await unitOfWork.SaveChangesAsync(cancellationToken);
        // The deletion is committed, even if the HTTP client disconnected meanwhile.
        await cacheInvalidator.InvalidateRecipeAsync(recipe.Id, recipe.Slug, CancellationToken.None);
    }
}
