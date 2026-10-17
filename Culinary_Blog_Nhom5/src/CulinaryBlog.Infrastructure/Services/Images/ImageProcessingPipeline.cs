using System.Diagnostics;
using CulinaryBlog.Application.Contracts;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services.Images;

public sealed class ImageProcessingPipeline(ImageWorkLock locks, ImageProcessingStore store, IFileStorageService storage,
    ImageVariantStorage variants, IImageVariantRenderer renderer, ImageGenerationCleanup cleanup, ILogger<ImageProcessingPipeline> logger)
{
    public async Task ProcessAsync(Guid imageId, CancellationToken ct)
    {
        await using var held = await locks.TryAcquireAsync(imageId, ct);
        if (held is null) return;
        var claim = await store.ClaimAsync(imageId, ct);
        if (claim is null) return;
        var elapsed = Stopwatch.StartNew();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(120)); // Less than 180s lease; child decode separately capped at 45s.
        string medium, thumbnail;
        try
        {
            variants.ValidateOriginal(claim.Generation.RecipeId, claim.OriginalUrl);
            await using var original = await storage.OpenReadAsync(claim.OriginalUrl, deadline.Token);
            var output = await renderer.RenderAsync(original, deadline.Token);
            using var mediumStream = new MemoryStream(output.Medium);
            using var thumbnailStream = new MemoryStream(output.Thumbnail);
            medium = await storage.UploadAsync(mediumStream, claim.Generation.MediumKey, "image/jpeg", deadline.Token);
            thumbnail = await storage.UploadAsync(thumbnailStream, claim.Generation.ThumbnailKey, "image/jpeg", deadline.Token);
        }
        catch (Exception error)
        {
            var permanent = error is InvalidDataException;
            var code = permanent ? "InvalidImage" : error is OperationCanceledException ? "ProcessingInterrupted" : "StorageOrWorkerFailure";
            // Leave manifest durable if cleanup fails; recurring sweep retries without the user's request.
            try { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15)); await cleanup.DeleteGenerationAsync(claim.Generation.Id, timeout.Token); }
            catch { logger.LogWarning("Image generation cleanup deferred for {RecipeImageId}", imageId); }
            await store.FailAsync(claim, code, permanent, CancellationToken.None);
            logger.LogWarning("Image processing {RecipeImageId} attempt {Attempt} failed with {ErrorCategory}", imageId, claim.Attempt, code);
            if (ct.IsCancellationRequested) throw new OperationCanceledException(ct);
            if (!permanent) throw new ImageProcessingException();
            return; // Business terminal Failed; no pointless retry of malformed content.
        }
        // Uncertain DB finalization must not delete outputs: commit may already have succeeded.
        // Processing/manifest remain recoverable if this throws; sweep checks the persisted references.
        if (!await store.CompleteAsync(claim, medium, thumbnail, CancellationToken.None))
        {
            await cleanup.DeleteGenerationAsync(claim.Generation.Id, CancellationToken.None);
            await store.FailAsync(claim, "ImageUnavailable", permanent: true, CancellationToken.None);
            return;
        }
        logger.LogInformation("Image variants completed for {RecipeImageId} attempt {Attempt} in {Elapsed} ms", imageId, claim.Attempt, elapsed.ElapsedMilliseconds);
    }
}

public sealed class ImageProcessingException() : Exception("Image processing failed; inspect sanitized delivery status.");
