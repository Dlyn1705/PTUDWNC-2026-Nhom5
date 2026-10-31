using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Application.Features.Recipes.Commands.UploadRecipeImage;

public sealed class UploadRecipeImageCommandHandler(
    IUnitOfWork unitOfWork,
    ICurrentUserService currentUser,
    IFileStorageService storage,
    IRecipeImageMutations mutations,
    IRecipeImageProcessingQueue processingQueue,
    ILogger<UploadRecipeImageCommandHandler> logger) : IRequestHandler<UploadRecipeImageCommand, RecipeImageDto>
{
    public async Task<RecipeImageDto> Handle(UploadRecipeImageCommand request, CancellationToken ct)
    {
        if (request.Length is <= 0 or > 5 * 1024 * 1024)
            throw new ValidationException("file", "Ảnh phải có dung lượng từ 1 byte đến 5 MiB.");
        if (string.IsNullOrWhiteSpace(request.AltText) == false && request.AltText.Length > 200)
            throw new ValidationException("altText", "Văn bản thay thế tối đa 200 ký tự.");

        var recipe = await unitOfWork.Recipes.GetDetailsByIdAsync(request.RecipeId, ct)
            ?? throw new NotFoundException("Recipe", request.RecipeId);
        if (!currentUser.IsAdmin && !string.Equals(recipe.AuthorId, currentUser.UserId, StringComparison.Ordinal))
            throw new ForbiddenException("Chỉ chủ sở hữu công thức hoặc Admin mới được tải ảnh lên.");
        if (recipe.Status == RecipeStatus.Archived)
            throw new ConflictException("Không thể tải ảnh lên công thức đã lưu trữ.", "RECIPE_ARCHIVED");

        var detected = await ImageFileValidation.DetectAsync(request.Content, request.FileName, request.ContentType, ct);
        var existingImages = recipe.Images.Where(x => !x.IsDeleted).ToList();
        var orderIndex = existingImages.Count == 0 ? 0 : existingImages.Max(x => x.OrderIndex) + 1;
        var image = RecipeImage.Create(request.RecipeId, string.Empty, request.AltText?.Trim(), existingImages.Count == 0, orderIndex);
        image.ProcessingStatus = "Pending";
        var objectKey = $"recipes/{request.RecipeId}/{image.Id:N}.{detected.Extension}";
        var url = await storage.UploadAsync(request.Content, objectKey, detected.ContentType, ct);
        image.OriginalUrl = url;

        try
        {
            await mutations.AddAsync(image, ct);
        }
        catch (Exception exception)
        {
            // A lost commit acknowledgement is not proof that the insert rolled back.
            // Query by stable ID before deleting original; if DB is unavailable retain it for operator reconciliation.
            RecipeImage? committed;
            try { committed = await unitOfWork.GetRecipeImageIncludingDeletedAsync(image.Id, CancellationToken.None); }
            catch
            {
                logger.LogError("Image upload commit outcome is unknown for {RecipeImageId} in {RecipeId}", image.Id, request.RecipeId);
                throw;
            }
            if (committed is null)
            {
                try { await storage.DeleteAsync(url, CancellationToken.None); }
                catch (Exception cleanupError) { logger.LogError(cleanupError, "Could not remove image object after database failure for {RecipeId}", request.RecipeId); }
                if (exception.GetType().Name == "DbUpdateException")
                    throw new ConflictException("Một ảnh khác vừa được tải lên công thức này. Vui lòng thử lại.", "RECIPE_IMAGE_CONFLICT");
                throw;
            }
        }

        try
        {
            await processingQueue.EnqueueAsync(image.Id, ct);
        }
        catch (Exception exception)
        {
            // Upload was committed: retain original and its atomic Pending intent for recovery.
            logger.LogWarning(exception, "Image {RecipeImageId} is pending background processing", image.Id);
        }

        return new RecipeImageDto(image.Id, image.RecipeId, image.OriginalUrl, image.MediumUrl,
            image.ThumbnailUrl, image.AltText, image.IsPrimary, image.OrderIndex, image.ProcessingStatus);
    }

}
