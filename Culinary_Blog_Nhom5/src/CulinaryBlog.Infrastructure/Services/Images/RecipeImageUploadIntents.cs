using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using CulinaryBlog.Infrastructure.Services.Jobs;

namespace CulinaryBlog.Infrastructure.Services.Images;

public sealed class RecipeImageUploadIntents(ApplicationDbContext db, TimeProvider clock) : IRecipeImageUploadIntents
{
    public async Task BeginAsync(Guid imageId, Guid recipeId, string objectKey, CancellationToken ct)
    {
        var expectedPrefix = $"recipes/{recipeId}/{imageId:N}.";
        if (!objectKey.StartsWith(expectedPrefix, StringComparison.Ordinal) || objectKey[expectedPrefix.Length..] is not ("jpg" or "png" or "webp" or "avif"))
            throw new InvalidOperationException("Invalid original object key.");
        var now = clock.GetUtcNow().UtcDateTime;
        db.RecipeImageUploadIntents.Add(new RecipeImageUploadIntent {
            ImageId = imageId, RecipeId = recipeId, ObjectKey = objectKey, CreatedAt = now, CleanupAfter = now.AddMinutes(10)
        });
        // Must commit BEFORE object I/O. If PostgreSQL is unavailable no untracked upload begins.
        await db.SaveChangesAsync(ct);
    }
}

public sealed class RecipeImageUploadCleanup(ApplicationDbContext db, ImageWorkLock locks, ImageVariantStorage variants,
    IFileStorageService storage, TimeProvider clock, ILogger<RecipeImageUploadCleanup> logger)
{
    public async Task SweepAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var intents = await db.RecipeImageUploadIntents.AsNoTracking().Where(x => !x.Failed && x.CleanupAfter <= now)
            .OrderBy(x => x.CleanupAfter).ThenBy(x => x.ImageId).Take(100).ToListAsync(ct);
        foreach (var intent in intents)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                await using var held = await locks.TryAcquireAsync(intent.ImageId, ct);
                if (held is null) continue;
                // Includes soft-deleted images/recipes. Retention/delete jobs own committed originals.
                if (!await db.RecipeImages.IgnoreQueryFilters().AnyAsync(x => x.Id == intent.ImageId, ct))
                    await storage.DeleteAsync(variants.Url(intent.ObjectKey), ct);
                if (intent.CreatedAt < now.AddDays(-7))
                    await db.RecipeImageUploadIntents.Where(x => x.ImageId == intent.ImageId).ExecuteDeleteAsync(ct);
                else
                    await db.RecipeImageUploadIntents.Where(x => x.ImageId == intent.ImageId).ExecuteUpdateAsync(set => set
                        .SetProperty(x => x.CleanedAt, now).SetProperty(x => x.CleanupAfter, now.AddDays(1))
                        .SetProperty(x => x.CleanupAttemptCount, 0).SetProperty(x => x.LastErrorCode, (string?)null), ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch
            {
                var attempt = Math.Min(intent.CleanupAttemptCount + 1, BackgroundJobRetryPolicy.MaximumAttempts);
                try
                {
                    await db.RecipeImageUploadIntents.Where(x => x.ImageId == intent.ImageId).ExecuteUpdateAsync(set => set
                        .SetProperty(x => x.CleanupAttemptCount, attempt).SetProperty(x => x.Failed, attempt >= BackgroundJobRetryPolicy.MaximumAttempts)
                        .SetProperty(x => x.LastErrorCode, "OriginalCleanupFailure")
                        .SetProperty(x => x.CleanupAfter, now.AddSeconds(BackgroundJobRetryPolicy.DelayAfter(attempt))), CancellationToken.None);
                }
                catch { /* DB outage leaves the original intent durable for a later read. */ }
                logger.LogWarning("Original reconciliation deferred for {RecipeImageId} attempt {Attempt} with {CorrelationId}", intent.ImageId, attempt, $"job-upload-{intent.ImageId:N}");
            }
        }
    }
}
