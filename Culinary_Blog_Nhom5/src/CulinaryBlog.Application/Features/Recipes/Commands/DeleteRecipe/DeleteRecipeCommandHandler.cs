using System;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipe;

public sealed class DeleteRecipeCommandHandler(
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUser) : IRequestHandler<DeleteRecipeCommand>
{
    public async Task Handle(DeleteRecipeCommand request, CancellationToken cancellationToken)
    {
        var recipe = await unitOfWork.Recipes.GetDetailsByIdAsync(request.RecipeId, cancellationToken)
            ?? throw new NotFoundException("Recipe", request.RecipeId);

        if (!currentUser.IsAdmin
            && !string.Equals(recipe.AuthorId, currentUser.UserId, StringComparison.Ordinal))
        {
            throw new ForbiddenException("Chỉ chủ sở hữu công thức hoặc Admin mới được xóa công thức.");
        }

        recipe.SoftDelete();
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
