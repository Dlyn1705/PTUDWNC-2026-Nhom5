using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Minio.Exceptions;

namespace CulinaryBlog.Infrastructure.Services.Images;

/// <summary>Bounded reconciliation of existing Completed rows; outage is not evidence that objects are missing.</summary>
public sealed class ImageVariantReconciler(ApplicationDbContext db, IFileStorageService storage, ImageWorkLock locks, TimeProvider clock)
{
    public async Task ReconcileAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var ids = await db.RecipeImageWork.AsNoTracking().Where(x => x.Status == "Completed" && x.NextAttemptAt <= now &&
            db.RecipeImages.Any(i => i.Id == x.ImageId && !i.Recipe.IsDeleted))
            .OrderBy(x => x.NextAttemptAt).Select(x => x.ImageId).Take(5).ToListAsync(ct);
        foreach (var id in ids)
        {
            await using var held = await locks.TryAcquireAsync(id, ct);
            if (held is null) continue;
            var image = await db.RecipeImages.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && !x.Recipe.IsDeleted, ct);
            if (image is null) continue;
            bool valid;
            try { valid = await ValidAsync(image.MediumUrl, 800, 600, ct) && await ValidAsync(image.ThumbnailUrl, 300, 300, ct); }
            catch (ObjectNotFoundException) { valid = false; }
            // Any other storage error propagates: don't clear URLs/reset attempts during an outage.
            if (valid)
            {
                await db.RecipeImageWork.Where(x => x.ImageId == id && x.Status == "Completed")
                    .ExecuteUpdateAsync(set => set.SetProperty(x => x.NextAttemptAt, now.AddHours(1)), ct);
                continue;
            }
            await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                await db.RecipeImageWork.Where(x => x.ImageId == id && x.Status == "Completed").ExecuteUpdateAsync(set => set
                    .SetProperty(x => x.Status, "Pending").SetProperty(x => x.AttemptCount, 0).SetProperty(x => x.NextAttemptAt, now)
                    .SetProperty(x => x.HangfireJobId, (string?)null).SetProperty(x => x.LastErrorCode, "VariantRepair"), ct);
                var version = Guid.NewGuid().ToByteArray();
                await db.RecipeImages.Where(x => x.Id == id).ExecuteUpdateAsync(set => set.SetProperty(x => x.ProcessingStatus, "Pending")
                    .SetProperty(x => x.MediumUrl, (string?)null).SetProperty(x => x.ThumbnailUrl, (string?)null)
                    .SetProperty(x => x.RowVersion, version).SetProperty(x => x.UpdatedAt, now), ct);
                await tx.CommitAsync(ct);
            });
        }
    }

    private async Task<bool> ValidAsync(string? url, int width, int height, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(url)) return false;
        await using var stream = await storage.OpenReadAsync(url, ct);
        using var bytes = new MemoryStream(); await IsolatedImageRenderer.CopyBoundedAsync(stream, bytes, ct);
        return JpegDimensions(bytes.ToArray()) == (width, height);
    }

    // Inspect JPEG SOF headers in managed code; no native decoder in the web/worker process.
    public static (int Width, int Height) JpegDimensions(byte[] data)
    {
        if (data.Length < 4 || data[0] != 0xff || data[1] != 0xd8) return (0, 0);
        for (var offset = 2; offset + 3 < data.Length;)
        {
            if (data[offset++] != 0xff) return (0, 0);
            while (offset < data.Length && data[offset] == 0xff) offset++;
            if (offset >= data.Length) break;
            var marker = data[offset++];
            if (marker is 0xd9 or 0xda) break;
            if (offset + 1 >= data.Length) break;
            var length = (data[offset] << 8) | data[offset + 1];
            if (length < 2 || offset + length > data.Length) break;
            if (marker is 0xc0 or 0xc1 or 0xc2 && length >= 7)
                return ((data[offset + 5] << 8) | data[offset + 6], (data[offset + 3] << 8) | data[offset + 4]);
            offset += length;
        }
        return (0, 0);
    }
}
