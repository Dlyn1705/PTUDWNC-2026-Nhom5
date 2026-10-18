using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.Infrastructure.Services.Images;

public sealed record ImageProcessingClaim(RecipeImageGeneration Generation, string OriginalUrl, int Attempt);

public sealed class ImageProcessingStore(ApplicationDbContext db, TimeProvider clock)
{
    public static readonly int[] RetrySeconds = [60, 300, 900];
    public async Task<ImageProcessingClaim?> ClaimAsync(Guid id, CancellationToken ct)
    {
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            // This scoped job context owns only processing state. Discard a rolled-back attempt's
            // tracked Work/generation before EF replays the transaction after a transient failure.
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var work = await db.RecipeImageWork.FromSqlInterpolated($"SELECT * FROM \"RecipeImageWork\" WHERE \"ImageId\" = {id} FOR UPDATE").AsNoTracking().SingleOrDefaultAsync(ct);
            var now = clock.GetUtcNow().UtcDateTime;
            if (work is null || work.Status is "Completed" or "Failed" or "Skipped" || work.NextAttemptAt > now ||
                work.Status == "Processing" && work.LeaseExpiresAt > now) return null;
            var image = await db.RecipeImages.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && !x.Recipe.IsDeleted, ct);
            if (image is null || work.AttemptCount >= 4)
            {
                work.Status = image is null ? "Skipped" : "Failed";
                work.LastErrorCode = image is null ? "ImageUnavailable" : "AttemptsExhausted";
                work.LeaseToken = null; work.LeaseExpiresAt = null; work.UpdatedAt = now;
                if (image is not null) await SetImageStateAsync(id, "Failed", ct);
                db.RecipeImageWork.Update(work);
                await db.SaveChangesAsync(ct); db.Entry(work).State = EntityState.Detached;
                await tx.CommitAsync(ct); return null;
            }
            var generation = new RecipeImageGeneration { ImageId = id, RecipeId = image.RecipeId, CreatedAt = now, CleanupAfter = now.AddMinutes(5) };
            db.RecipeImageGenerations.Add(generation);
            work.Status = "Processing"; work.AttemptCount++; work.LeaseToken = generation.Id;
            work.LeaseExpiresAt = now.AddMinutes(3); work.UpdatedAt = now;
            await SetImageStateAsync(id, "Processing", ct);
            db.RecipeImageWork.Update(work);
            await db.SaveChangesAsync(ct); db.Entry(work).State = EntityState.Detached;
            db.Entry(generation).State = EntityState.Detached;
            await tx.CommitAsync(ct);
            return new ImageProcessingClaim(generation, image.OriginalUrl, work.AttemptCount);
        });
    }

    public async Task<bool> CompleteAsync(ImageProcessingClaim claim, string medium, string thumbnail, CancellationToken ct)
    {
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var generation = claim.Generation;
            // Execution strategy can replay after a successful commit whose acknowledgement was lost.
            if (await db.RecipeImages.IgnoreQueryFilters().AnyAsync(x => x.Id == generation.ImageId &&
                x.ProcessingStatus == "Completed" && x.MediumUrl == medium && x.ThumbnailUrl == thumbnail, ct)) return true;
            var current = await db.RecipeImageWork.FromSqlInterpolated(
                $"SELECT * FROM \"RecipeImageWork\" WHERE \"ImageId\" = {generation.ImageId} FOR UPDATE").AsNoTracking().SingleOrDefaultAsync(ct);
            if (current?.LeaseToken != generation.Id || current.Status != "Processing") return false;
            var version = Guid.NewGuid().ToByteArray(); var now = clock.GetUtcNow().UtcDateTime;
            var count = await db.RecipeImages.Where(x => x.Id == generation.ImageId && !x.Recipe.IsDeleted &&
                db.RecipeImageWork.Any(w => w.ImageId == x.Id && w.LeaseToken == generation.Id && w.Status == "Processing"))
                .ExecuteUpdateAsync(set => set.SetProperty(x => x.MediumUrl, medium).SetProperty(x => x.ThumbnailUrl, thumbnail)
                    .SetProperty(x => x.ProcessingStatus, "Completed").SetProperty(x => x.UpdatedAt, now).SetProperty(x => x.RowVersion, version), ct);
            if (count == 0) return false;
            await db.RecipeImageWork.Where(x => x.ImageId == generation.ImageId && x.LeaseToken == generation.Id)
                .ExecuteUpdateAsync(set => set.SetProperty(x => x.Status, "Completed").SetProperty(x => x.LeaseToken, (Guid?)null)
                    .SetProperty(x => x.LeaseExpiresAt, (DateTime?)null).SetProperty(x => x.LastErrorCode, (string?)null).SetProperty(x => x.UpdatedAt, now)
                    .SetProperty(x => x.NextAttemptAt, now.AddHours(1)), ct);
            await tx.CommitAsync(ct); return true;
        });
    }

    public async Task FailAsync(ImageProcessingClaim claim, string code, bool permanent, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var state = permanent || claim.Attempt >= 4 ? "Failed" : "Pending";
        var next = now.AddSeconds(RetrySeconds[Math.Min(claim.Attempt - 1, 2)]);
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var changed = await db.RecipeImageWork.Where(x => x.ImageId == claim.Generation.ImageId && x.LeaseToken == claim.Generation.Id && x.Status == "Processing")
                .ExecuteUpdateAsync(set => set.SetProperty(x => x.Status, state).SetProperty(x => x.NextAttemptAt, next)
                    .SetProperty(x => x.LeaseToken, (Guid?)null).SetProperty(x => x.LeaseExpiresAt, (DateTime?)null)
                    .SetProperty(x => x.LastErrorCode, code).SetProperty(x => x.UpdatedAt, now), ct);
            if (changed == 1) await SetImageStateAsync(claim.Generation.ImageId, state, ct);
            await tx.CommitAsync(ct);
        });
    }

    private Task<int> SetImageStateAsync(Guid id, string state, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime; var version = Guid.NewGuid().ToByteArray();
        return db.RecipeImages.Where(x => x.Id == id).ExecuteUpdateAsync(set => set.SetProperty(x => x.ProcessingStatus, state)
            .SetProperty(x => x.UpdatedAt, now).SetProperty(x => x.RowVersion, version), ct);
    }
}
