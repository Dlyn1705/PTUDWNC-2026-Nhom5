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

        var detected = await DetectImageAsync(request.Content, request.FileName, request.ContentType, ct);
        var existingImages = recipe.Images.Where(x => !x.IsDeleted).ToList();
        var orderIndex = existingImages.Count == 0 ? 0 : existingImages.Max(x => x.OrderIndex) + 1;
        var image = RecipeImage.Create(request.RecipeId, string.Empty, request.AltText?.Trim(), existingImages.Count == 0, orderIndex);
        image.ProcessingStatus = "Pending";
        var objectKey = $"recipes/{request.RecipeId}/{Guid.NewGuid():N}.{detected.Extension}";
        var url = await storage.UploadAsync(request.Content, objectKey, detected.ContentType, ct);
        image.OriginalUrl = url;
        await unitOfWork.AddRecipeImageAsync(image, ct);

        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (Exception exception)
        {
            try { await storage.DeleteAsync(url, CancellationToken.None); }
            catch (Exception cleanupError) { logger.LogError(cleanupError, "Could not remove image object after database failure for {RecipeId}", request.RecipeId); }
            if (exception.GetType().Name == "DbUpdateException")
                throw new ConflictException("Một ảnh khác vừa được tải lên công thức này. Vui lòng thử lại.", "RECIPE_IMAGE_CONFLICT");
            throw;
        }

        try
        {
            await processingQueue.EnqueueAsync(image.Id, ct);
        }
        catch
        {
            try
            {
                unitOfWork.RemoveRecipeImage(image);
                await unitOfWork.SaveChangesAsync(CancellationToken.None);
                await storage.DeleteAsync(url, CancellationToken.None);
            }
            catch (Exception cleanupError)
            {
                logger.LogError(cleanupError, "Could not compensate image upload {RecipeImageId} after queue failure", image.Id);
            }
            throw new InvalidOperationException("Ảnh đã được lưu nhưng chưa thể đưa vào hàng đợi xử lý. Vui lòng thử lại sau.");
        }

        return new RecipeImageDto(image.Id, image.RecipeId, image.OriginalUrl, image.MediumUrl,
            image.ThumbnailUrl, image.AltText, image.IsPrimary, image.OrderIndex, image.ProcessingStatus);
    }

    private static async Task<(string Extension, string ContentType)> DetectImageAsync(Stream stream, string fileName, string declaredType, CancellationToken ct)
    {
        if (!stream.CanSeek) throw new ValidationException("file", "Không thể đọc file được gửi lên.");
        stream.Position = 0;
        var header = new byte[Math.Min(32, (int)Math.Min(stream.Length, 32))];
        var read = await stream.ReadAsync(header.AsMemory(), ct);
        stream.Position = 0;
        var bytes = header.AsSpan(0, read);
        (string ext, string mime)? detected = null;
        var hasAvifBrand = false;
        for (var offset = 8; offset + 4 <= read; offset += 4)
        {
            if (bytes.Slice(offset, 4).SequenceEqual("avif"u8) || bytes.Slice(offset, 4).SequenceEqual("avis"u8))
            {
                hasAvifBrand = true;
                break;
            }
        }

        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) detected = ("jpg", "image/jpeg");
        else if (bytes.Length >= 8 && bytes[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) detected = ("png", "image/png");
        else if (bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes.Slice(8, 4).SequenceEqual("WEBP"u8)) detected = ("webp", "image/webp");
        else if (bytes.Length >= 12 && bytes.Slice(4, 4).SequenceEqual("ftyp"u8) && hasAvifBrand) detected = ("avif", "image/avif");

        if (detected is null) throw new ValidationException("file", "Nội dung không phải ảnh JPEG, PNG, WebP hoặc AVIF hợp lệ.");
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var extensionMatches = detected.Value.ext == "jpg" ? extension is ".jpg" or ".jpeg" : extension == "." + detected.Value.ext;
        if (!extensionMatches || !string.Equals(declaredType, detected.Value.mime, StringComparison.OrdinalIgnoreCase))
            throw new ValidationException("file", "Phần mở rộng hoặc MIME của file không khớp với nội dung ảnh.");
        return detected.Value;
    }
}
