using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class RecipeImageDeletionJob(
    ApplicationDbContext db,
    IFileStorageService storage,
    ILogger<RecipeImageDeletionJob> logger)
{
    public async Task DeleteAsync(Guid imageId, CancellationToken cancellationToken)
    {
        var image = await db.RecipeImages.IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.Id == imageId, cancellationToken);
        if (image is null) return;
        if (!image.IsDeleted)
        {
            logger.LogWarning("Skipping image deletion job for image {ImageId} because it is not soft-deleted", imageId);
            return;
        }

        await storage.DeleteAsync(image.OriginalUrl, cancellationToken);
        if (!string.IsNullOrWhiteSpace(image.MediumUrl))
            await storage.DeleteAsync(image.MediumUrl, cancellationToken);
        if (!string.IsNullOrWhiteSpace(image.ThumbnailUrl))
            await storage.DeleteAsync(image.ThumbnailUrl, cancellationToken);

        db.RecipeImages.Remove(image);
        await db.SaveChangesAsync(cancellationToken);
    }
}

public sealed class RecipeImageDeletionRecoveryJob(
    ApplicationDbContext db,
    IBackgroundJobClient backgroundJobs)
{
    public async Task EnqueuePendingAsync(CancellationToken cancellationToken)
    {
        var pendingImageIds = await db.RecipeImages.IgnoreQueryFilters()
            .Where(image => image.IsDeleted)
            .Select(image => image.Id)
            .ToListAsync(cancellationToken);

        foreach (var imageId in pendingImageIds)
            backgroundJobs.Enqueue<RecipeImageDeletionJob>(job => job.DeleteAsync(imageId, CancellationToken.None));
    }
}
