using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipeImage;

public sealed class DeleteRecipeImageCommandHandler(
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUser,
    IRecipeImageDeletionQueue deletionQueue) : IRequestHandler<DeleteRecipeImageCommand>
{
    public async Task Handle(DeleteRecipeImageCommand request, CancellationToken cancellationToken)
    {
        var recipe = await unitOfWork.Recipes.GetDetailsByIdAsync(request.RecipeId, cancellationToken)
            ?? throw new NotFoundException("Recipe", request.RecipeId);

        if (!currentUser.IsAdmin && !string.Equals(recipe.AuthorId, currentUser.UserId, StringComparison.Ordinal))
            throw new ForbiddenException("Chỉ chủ sở hữu công thức hoặc Admin mới được xóa ảnh.");

        var image = await unitOfWork.GetRecipeImageIncludingDeletedAsync(request.ImageId, cancellationToken);
        if (image is null || image.RecipeId != recipe.Id)
            throw new NotFoundException("RecipeImage", request.ImageId);

        if (!image.IsDeleted)
        {
            RecipeImage? replacement = null;
            if (image.IsPrimary)
            {
                replacement = recipe.Images
                    .Where(candidate => candidate.Id != image.Id && !candidate.IsDeleted)
                    .OrderBy(candidate => candidate.OrderIndex)
                    .ThenBy(candidate => candidate.CreatedAt)
                    .ThenBy(candidate => candidate.Id)
                    .FirstOrDefault();
            }

            await unitOfWork.SoftDeleteRecipeImageAsync(image, replacement, cancellationToken);
        }

        // The soft-deleted row retains all object URLs until the durable Hangfire job succeeds.
        // Repeating DELETE re-enqueues cleanup if queueing or a previous cleanup attempt failed.
        await deletionQueue.EnqueueAsync(image.Id, cancellationToken);
    }
}
