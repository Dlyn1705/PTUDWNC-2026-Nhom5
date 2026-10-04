using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ImageMagick;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class HangfireRecipeImageProcessingQueue(IBackgroundJobClient jobs) : IRecipeImageProcessingQueue
{
    public Task EnqueueAsync(Guid imageId, CancellationToken cancellationToken = default)
    {
        jobs.Enqueue<RecipeImageProcessingJob>(job => job.ProcessAsync(imageId, CancellationToken.None));
        return Task.CompletedTask;
    }
}

public sealed class RecipeImageProcessingJob(
    ApplicationDbContext db,
    IFileStorageService storage,
    ILogger<RecipeImageProcessingJob> logger)
{
    static RecipeImageProcessingJob()
    {
        // Enforce decoder limits before the pixel cache is allocated, not only after decoding.
        ResourceLimits.Width = 10_000;
        ResourceLimits.Height = 10_000;
        ResourceLimits.Area = 40_000_000;
        ResourceLimits.Memory = 256 * 1024 * 1024;
        ResourceLimits.Disk = 256 * 1024 * 1024;
    }

    [AutomaticRetry(Attempts = 3, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task ProcessAsync(Guid imageId, CancellationToken cancellationToken)
    {
        var image = await db.RecipeImages.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == imageId, cancellationToken);
        if (image is null || image.IsDeleted) return;
        if (!string.IsNullOrEmpty(image.MediumUrl) && !string.IsNullOrEmpty(image.ThumbnailUrl)) return;

        image.ProcessingStatus = "Processing";
        await db.SaveChangesAsync(cancellationToken);
        try
        {
            var original = await storage.OpenReadAsync(image.OriginalUrl, cancellationToken);
            await using (original)
            using (var decoded = new MagickImage(original))
            {
                if (decoded.Width == 0 || decoded.Height == 0 || (long)decoded.Width * decoded.Height > 40_000_000)
                    throw new InvalidDataException("Image dimensions exceed the supported limit.");

                var mediumKey = $"recipes/{image.RecipeId}/{image.Id:N}-medium.jpg";
                var thumbnailKey = $"recipes/{image.RecipeId}/{image.Id:N}-thumbnail.jpg";
                image.MediumUrl = await CreateVariantAsync(decoded, mediumKey, 800, 600, cancellationToken);
                image.ThumbnailUrl = await CreateVariantAsync(decoded, thumbnailKey, 300, 300, cancellationToken);
                image.ProcessingStatus = "Completed";
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        catch
        {
            image.ProcessingStatus = "Failed";
            await db.SaveChangesAsync(CancellationToken.None);
            throw;
        }
        logger.LogInformation("Recipe image variants processed for {RecipeImageId}", imageId);
    }

    private async Task<string> CreateVariantAsync(MagickImage original, string key, uint width, uint height, CancellationToken ct)
    {
        using var variant = (MagickImage)original.Clone();
        variant.Resize(new MagickGeometry(width, height) { IgnoreAspectRatio = false });
        variant.Format = MagickFormat.Jpeg;
        variant.Quality = 85;
        await using var buffer = new MemoryStream();
        await variant.WriteAsync(buffer, ct);
        buffer.Position = 0;
        return await storage.UploadAsync(buffer, key, "image/jpeg", ct);
    }
}
