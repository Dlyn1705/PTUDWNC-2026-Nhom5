using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipeImage;

public sealed class DeleteRecipeImageCommandHandler(
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUser,
    IRecipeImageDeletionQueue deletionQueue,
    IRecipeImageMutations mutations,
    ILogger<DeleteRecipeImageCommandHandler> logger) : IRequestHandler<DeleteRecipeImageCommand>
{
    public async Task Handle(DeleteRecipeImageCommand request, CancellationToken cancellationToken)
    {
        var recipe = await unitOfWork.Recipes.GetDetailsByIdAsync(request.RecipeId, cancellationToken)
            ?? throw new NotFoundException("Recipe", request.RecipeId);

        if (!currentUser.IsAdmin && !string.Equals(recipe.AuthorId, currentUser.UserId, StringComparison.Ordinal))
            throw new ForbiddenException("Chỉ chủ sở hữu công thức hoặc Admin mới được xóa ảnh.");

        await mutations.DeleteAsync(request.RecipeId, request.ImageId, cancellationToken);

        // IsDeleted and the retained URLs are the durable cleanup record. The recurring
        // recovery job will enqueue it again if this best-effort fast path is unavailable.
        try
        {
            await deletionQueue.EnqueueAsync(request.ImageId, cancellationToken);
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                exception,
                "Recipe image {RecipeImageId} was marked for deletion but could not be queued immediately",
                request.ImageId);
        }
    }
}
