using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.Infrastructure.Services.Images;

public sealed class ImageGenerationCleanup(ApplicationDbContext db, ImageVariantStorage variants, IFileStorageService storage, TimeProvider clock)
{
    // Caller holds the image session lock. Ledger has no cascading FK and survives hard delete.
    public async Task DeleteImageObjectsAsync(Guid imageId, CancellationToken ct)
    {
        var image = await db.RecipeImages.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == imageId, ct);
        if (image is not null)
            foreach (var url in new[] { image.OriginalUrl, image.MediumUrl, image.ThumbnailUrl }.Where(x => !string.IsNullOrEmpty(x)).Distinct())
                await storage.DeleteAsync(url!, ct);
        foreach (var generation in await db.RecipeImageGenerations.AsNoTracking().Where(x => x.ImageId == imageId).ToListAsync(ct))
            await DeleteGenerationAsync(generation.Id, ct);
        await db.RecipeImageWork.Where(x => x.ImageId == imageId).ExecuteUpdateAsync(set => set.SetProperty(x => x.Status, "Skipped")
            .SetProperty(x => x.LeaseToken, (Guid?)null).SetProperty(x => x.LeaseExpiresAt, (DateTime?)null), ct);
    }

    public async Task DeleteGenerationAsync(Guid id, CancellationToken ct)
    {
        var generation = await db.RecipeImageGenerations.AsNoTracking().SingleAsync(x => x.Id == id, ct);
        await variants.DeleteAsync(generation.MediumKey, ct);
        await variants.DeleteAsync(generation.ThumbnailKey, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        // Keep tombstones seven days, sweeping daily for ambiguous PUT/connection outcomes.
        if (generation.CleanedAt < now.AddDays(-7))
            await db.RecipeImageGenerations.Where(x => x.Id == id).ExecuteDeleteAsync(ct);
        else
            await db.RecipeImageGenerations.Where(x => x.Id == id).ExecuteUpdateAsync(set => set.SetProperty(x => x.CleanedAt, generation.CleanedAt ?? now)
                .SetProperty(x => x.CleanupAfter, now.AddDays(1)), ct);
    }

    public async Task SweepAsync(ImageWorkLock locks, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var generations = await db.RecipeImageGenerations.AsNoTracking().Where(x => x.CleanupAfter <= now)
            .OrderBy(x => x.CleanupAfter).Take(100).ToListAsync(ct);
        foreach (var generation in generations)
        {
            await using var held = await locks.TryAcquireAsync(generation.ImageId, ct);
            if (held is null) continue;
            var image = await db.RecipeImages.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(x => x.Id == generation.ImageId, ct);
            if (image is not null && image.MediumUrl == variants.Url(generation.MediumKey) && image.ThumbnailUrl == variants.Url(generation.ThumbnailKey))
            {
                await db.RecipeImageGenerations.Where(x => x.Id == generation.Id).ExecuteUpdateAsync(set => set.SetProperty(x => x.CleanupAfter, now.AddDays(1)), ct);
                continue; // Also retain published objects while recipe/image is soft-deleted, until delete/purge owns removal.
            }
            await DeleteGenerationAsync(generation.Id, ct);
        }
        // Tombstones for rows with no image and no remaining object manifest no longer serve a purpose.
        await db.RecipeImageWork.Where(x => !db.RecipeImages.IgnoreQueryFilters().Any(i => i.Id == x.ImageId) &&
            !db.RecipeImageGenerations.Any(g => g.ImageId == x.ImageId)).ExecuteDeleteAsync(ct);
    }
}
