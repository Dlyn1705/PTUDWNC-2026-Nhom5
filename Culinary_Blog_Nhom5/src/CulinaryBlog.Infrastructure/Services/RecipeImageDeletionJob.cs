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
