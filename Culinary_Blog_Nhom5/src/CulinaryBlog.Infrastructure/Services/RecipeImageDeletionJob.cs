using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
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
    [AutomaticRetry(Attempts = 3, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task DeleteAsync(Guid imageId, CancellationToken cancellationToken)
    {
        var image = await db.RecipeImages.IgnoreQueryFilters()
            .FirstOrDefaultAsync(candidate => candidate.Id == imageId, cancellationToken);
        if (image is null) return;
        if (!image.IsDeleted)
            throw new InvalidOperationException($"Recipe image {imageId} is not marked for deletion.");

        var urls = new[] { image.OriginalUrl, image.MediumUrl, image.ThumbnailUrl }
            .Where(url => !string.IsNullOrWhiteSpace(url))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        foreach (var url in urls)
            await storage.DeleteAsync(url!, cancellationToken);

        db.RecipeImages.Remove(image);
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Deleted recipe image objects for {RecipeImageId}", imageId);
    }
}

public sealed class RecipeImageDeletionRecoveryJob(
    ApplicationDbContext db,
    IBackgroundJobClient jobs,
    ILogger<RecipeImageDeletionRecoveryJob> logger)
{
    private const int BatchSize = 100;

    [DisableConcurrentExecution(timeoutInSeconds: 300)]
    public async Task EnqueuePendingAsync(CancellationToken cancellationToken)
    {
        var pendingImageIds = await db.RecipeImages
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(image => image.IsDeleted)
            .OrderBy(image => image.UpdatedAt ?? image.CreatedAt)
            .Select(image => image.Id)
            .Take(BatchSize)
            .ToListAsync(cancellationToken);

        foreach (var imageId in pendingImageIds)
        {
            jobs.Enqueue<RecipeImageDeletionJob>(job =>
                job.DeleteAsync(imageId, CancellationToken.None));
        }

        if (pendingImageIds.Count > 0)
        {
            logger.LogInformation(
                "Re-enqueued {RecipeImageCount} pending recipe image deletions",
                pendingImageIds.Count);
        }
    }
}
