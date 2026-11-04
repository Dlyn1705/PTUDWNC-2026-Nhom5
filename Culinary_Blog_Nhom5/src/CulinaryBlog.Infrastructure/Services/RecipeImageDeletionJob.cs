using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Services.Images;
using CulinaryBlog.Infrastructure.Services.Jobs;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class RecipeImageDeletionJob(ApplicationDbContext db, IFileStorageService storage,
    ILogger<RecipeImageDeletionJob> logger, ImageWorkLock locks, ImageGenerationCleanup cleanup,
    ImageDeletionStore store, TimeProvider clock)
{
    [AutomaticRetry(Attempts = BackgroundJobRetryPolicy.RetryCount,
        DelaysInSeconds = new[] { BackgroundJobRetryPolicy.FirstDelaySeconds, BackgroundJobRetryPolicy.SecondDelaySeconds, BackgroundJobRetryPolicy.ThirdDelaySeconds },
        OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task DeleteAsync(Guid imageId, CancellationToken cancellationToken)
    {
        try { await DeleteCoreAsync(imageId, cancellationToken); }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw new OperationCanceledException(cancellationToken); }
        catch (ImageDeletionException) { throw; }
        catch { throw new ImageDeletionException(); }
    }

    private async Task DeleteCoreAsync(Guid imageId, CancellationToken cancellationToken)
    {
        await using var held = await locks.TryAcquireAsync(imageId, cancellationToken)
            ?? throw new ImageDeletionException();
        var image = await db.RecipeImages.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == imageId, cancellationToken);
        if (image is not null)
        {
            if (!image.IsDeleted) return;
            await store.EnsureAsync(imageId, image.RecipeId, cancellationToken);
        }
        var claim = await store.ClaimAsync(imageId, cancellationToken);
        if (claim is null) return;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(120));
        try
        {
            await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                db.ChangeTracker.Clear();
                await using var tx = await db.Database.BeginTransactionAsync(deadline.Token);
                // Serialize with recipe soft-delete. Purge uses a try-lock on the image,
                // so it releases its recipe lock instead of deadlocking this worker.
                var recipe = await db.Recipes.FromSqlInterpolated($"SELECT * FROM \"Recipes\" WHERE \"Id\" = {claim.RecipeId} FOR UPDATE")
                    .IgnoreQueryFilters().AsNoTracking().SingleOrDefaultAsync(deadline.Token);
                var now = clock.GetUtcNow().UtcDateTime;
                if (recipe is { IsDeleted: true })
                {
                    // Whole-recipe deletion owns retention and purge, including previously hidden images.
                    var until = (recipe.UpdatedAt ?? recipe.CreatedAt).AddDays(30);
                    await store.DeferRetentionAsync(claim, until > now ? until : now.AddHours(1), deadline.Token);
                    return;
                }
                var current = await db.RecipeImages.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == imageId, deadline.Token);
                if (current is not null && !current.IsDeleted) throw new ImageDeletionException();
                if (current is not null)
                {
                    foreach (var url in new[] { current.OriginalUrl, current.MediumUrl, current.ThumbnailUrl }
                        .Where(url => !string.IsNullOrWhiteSpace(url)).Distinct(StringComparer.Ordinal))
                        await storage.DeleteAsync(url!, deadline.Token);
                }
                await cleanup.DeleteImageObjectsAsync(imageId, deadline.Token, includeReferencedObjects: false);
                if (current is not null) db.RecipeImages.Remove(current);
                await db.SaveChangesAsync(deadline.Token);
                // Metadata deletion and completed intent commit together. Unknown ACK is safe to replay.
                await db.RecipeImageDeletionWork.Where(x => x.ImageId == imageId && x.LeaseToken == claim.Token && x.Status == "Processing")
                    .ExecuteUpdateAsync(set => set.SetProperty(x => x.Status, "Completed").SetProperty(x => x.UpdatedAt, now)
                        .SetProperty(x => x.LeaseToken, (Guid?)null).SetProperty(x => x.LeaseExpiresAt, (DateTime?)null)
                        .SetProperty(x => x.LastErrorCode, (string?)null), deadline.Token);
                await tx.CommitAsync(deadline.Token);
            });
            logger.LogInformation("Image deletion reconciled for {RecipeImageId} attempt {Attempt} with {CorrelationId}", imageId, claim.Attempt, $"job-delete-{imageId:N}");
        }
        catch (Exception error)
        {
            var category = error is OperationCanceledException ? "DeletionInterrupted" : "StorageOrDatabaseFailure";
            try { await store.FailAsync(claim, category, CancellationToken.None); }
            catch { logger.LogWarning("Deletion failure recording deferred for {RecipeImageId}; lease recovery remains available", imageId); }
            logger.LogWarning("Image deletion deferred for {RecipeImageId} attempt {Attempt} with {ErrorCategory} and {CorrelationId}",
                imageId, claim.Attempt, category, $"job-delete-{imageId:N}");
            if (cancellationToken.IsCancellationRequested) throw new OperationCanceledException(cancellationToken);
            throw new ImageDeletionException(); // No raw storage/connection error persisted in Hangfire.
        }
    }
}

public sealed class ImageDeletionException() : Exception("Image deletion was deferred; inspect the durable deletion intent.");

public sealed class RecipeImageDeletionRecoveryJob(ApplicationDbContext db, IBackgroundJobClient jobs,
    ILogger<RecipeImageDeletionRecoveryJob> logger, JobStorage storage, ImageDeletionStore store, TimeProvider clock)
{
    [AutomaticRetry(Attempts = 0)]
    [DisableConcurrentExecution(300)]
    public async Task EnqueuePendingAsync(CancellationToken cancellationToken)
    {
        // Backfill legacy tombstones. Never reset an existing attempt cap or terminal status.
        var missing = await db.RecipeImages.IgnoreQueryFilters().AsNoTracking().Where(image => image.IsDeleted &&
            !db.RecipeImageDeletionWork.Any(work => work.ImageId == image.Id)).OrderBy(x => x.Id).Take(100).ToListAsync(cancellationToken);
        foreach (var image in missing) await store.EnsureAsync(image.Id, image.RecipeId, cancellationToken);
        var now = clock.GetUtcNow().UtcDateTime;
        var ids = await db.RecipeImageDeletionWork.AsNoTracking().Where(x => x.NextAttemptAt <= now &&
            (x.Status == "Pending" || x.Status == "Processing" && (x.LeaseExpiresAt == null || x.LeaseExpiresAt <= now)) &&
            !db.Recipes.IgnoreQueryFilters().Any(r => r.Id == x.RecipeId && r.IsDeleted))
            .OrderBy(x => x.NextAttemptAt).ThenBy(x => x.ImageId).Take(100).Select(x => x.ImageId).ToListAsync(cancellationToken);
        foreach (var id in ids)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                await DispatchOneAsync(id, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch { logger.LogWarning("Deletion dispatch deferred for {RecipeImageId} with {CorrelationId}", id, $"job-delete-{id:N}"); }
        }
    }
    public async Task DispatchOneAsync(Guid id, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
            var work = await db.RecipeImageDeletionWork.FromSqlInterpolated($"SELECT * FROM \"RecipeImageDeletionWork\" WHERE \"ImageId\" = {id} FOR UPDATE")
                .SingleOrDefaultAsync(cancellationToken);
            if (work is null || work.Status is "Completed" or "Failed" or "Skipped" || work.NextAttemptAt > now ||
                work.Status == "Processing" && work.LeaseExpiresAt > now) return;
            if (work.Status == "Pending" && work.HangfireJobId is not null)
            {
                using var connection = storage.GetConnection();
                if (connection.GetJobData(work.HangfireJobId)?.State is "Enqueued" or "Processing" or "Scheduled") return;
            }
            work.HangfireJobId = jobs.Enqueue<RecipeImageDeletionJob>(job => job.DeleteAsync(id, CancellationToken.None));
            work.UpdatedAt = now;
            await db.SaveChangesAsync(cancellationToken); await tx.CommitAsync(cancellationToken);
        });
    }

}
