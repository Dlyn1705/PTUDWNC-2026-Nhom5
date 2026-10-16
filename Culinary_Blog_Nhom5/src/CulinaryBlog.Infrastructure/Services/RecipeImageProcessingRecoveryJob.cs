using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Services.Images;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class RecipeImageProcessingRecoveryJob(ApplicationDbContext db, IBackgroundJobClient jobs, JobStorage storage,
    ImageWorkLock locks, ImageGenerationCleanup cleanup, ImageVariantReconciler reconciler, TimeProvider clock, ILogger<RecipeImageProcessingRecoveryJob> logger)
{
    [AutomaticRetry(Attempts = 0)]
    public async Task EnqueuePendingAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var ids = await db.RecipeImageWork.AsNoTracking().Where(x =>
            x.Status == "Pending" && x.NextAttemptAt <= now || x.Status == "Processing" && (x.LeaseExpiresAt == null || x.LeaseExpiresAt <= now))
            .OrderBy(x => x.NextAttemptAt).Select(x => x.ImageId).Take(100).ToListAsync(ct);
        foreach (var id in ids)
        {
            try
            {
                await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
                {
                    // Only a short Work row lock for dispatch. A fast worker may acquire its image session
                    // lock and wait for this commit; it must not finish as a no-op because dispatcher owns that lock.
                    await using var tx = await db.Database.BeginTransactionAsync(ct);
                    var work = await db.RecipeImageWork.FromSqlInterpolated(
                        $"SELECT * FROM \"RecipeImageWork\" WHERE \"ImageId\" = {id} FOR UPDATE").AsNoTracking().SingleOrDefaultAsync(ct);
                    if (work is null || work.Status is "Completed" or "Failed" or "Skipped" || work.NextAttemptAt > now || work.Status == "Processing" && work.LeaseExpiresAt > now) return;
                    if (work.Status == "Pending" && work.HangfireJobId is not null)
                    {
                        using var connection = storage.GetConnection();
                        if (connection.GetJobData(work.HangfireJobId)?.State is "Enqueued" or "Processing" or "Scheduled") return;
                    }
                    var jobId = jobs.Enqueue<RecipeImageProcessingJob>(job => job.ProcessAsync(id, CancellationToken.None));
                    await db.RecipeImageWork.Where(x => x.ImageId == id).ExecuteUpdateAsync(set => set.SetProperty(x => x.HangfireJobId, jobId), ct);
                    await tx.CommitAsync(ct);
                });
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch { logger.LogWarning("Image dispatch deferred for {RecipeImageId}", id); }
        }
        await cleanup.SweepAsync(locks, ct);
        await reconciler.ReconcileAsync(ct);
    }
}
