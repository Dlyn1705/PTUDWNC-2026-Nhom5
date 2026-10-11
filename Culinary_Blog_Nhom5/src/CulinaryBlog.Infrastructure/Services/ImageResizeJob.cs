using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SkiaSharp;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class ImageResizeJob(
    ApplicationDbContext db,
    IWebHostEnvironment environment,
    ILogger<ImageResizeJob> logger)
{
    public async Task ExecuteAsync(Guid imageId)
    {
        var entity = await db.RecipeImages.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == imageId);
        if (entity is null || entity.IsDeleted) return;

        entity.ProcessingStatus = ImageProcessingStatus.Processing;
        await db.SaveChangesAsync();
        try
        {
            var webRoot = environment.WebRootPath ?? Path.Combine(environment.ContentRootPath, "wwwroot");
            var originalPath = ResolveUploadPath(webRoot, entity.OriginalUrl);
            using var source = SKBitmap.Decode(originalPath) ?? throw new InvalidDataException("Image decoder could not read the uploaded file.");
            var baseName = Path.Combine(Path.GetDirectoryName(originalPath)!, Path.GetFileNameWithoutExtension(originalPath));
            var mediumPath = baseName + ".medium.webp";
            var thumbnailPath = baseName + ".thumbnail.webp";
            await WriteResizedAsync(source, mediumPath, 800, 600, crop: false);
            await WriteResizedAsync(source, thumbnailPath, 300, 300, crop: true);

            entity.MediumUrl = ToPublicUrl(webRoot, mediumPath);
            entity.ThumbnailUrl = ToPublicUrl(webRoot, thumbnailPath);
            entity.ProcessingStatus = ImageProcessingStatus.Completed;
            entity.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        catch (Exception exception)
        {
            entity.ProcessingStatus = ImageProcessingStatus.Failed;
            entity.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            logger.LogError(exception, "Failed to resize recipe image {ImageId}", imageId);
            throw;
        }
    }

    private static Task WriteResizedAsync(SKBitmap source, string destination, int outputWidth, int outputHeight, bool crop)
    {
        var scale = crop
            ? Math.Max(outputWidth / (float)source.Width, outputHeight / (float)source.Height)
            : Math.Min(1f, Math.Min(outputWidth / (float)source.Width, outputHeight / (float)source.Height));
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));
        var canvasWidth = crop ? outputWidth : width;
        var canvasHeight = crop ? outputHeight : height;
        var info = new SKImageInfo(canvasWidth, canvasHeight, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var surface = SKSurface.Create(info);
        surface.Canvas.Clear(SKColors.Transparent);
        var left = (canvasWidth - width) / 2f;
        var top = (canvasHeight - height) / 2f;
        using var paint = new SKPaint { IsAntialias = true };
        using var image = SKImage.FromBitmap(source);
        surface.Canvas.DrawImage(image, new SKRect(left, top, left + width, top + height), new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear), paint);
        using var snapshot = surface.Snapshot();
        using var encoded = snapshot.Encode(SKEncodedImageFormat.Webp, 82) ?? throw new InvalidDataException("WebP encoding failed.");
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        using var output = File.Create(destination);
        encoded.SaveTo(output);
        return Task.CompletedTask;
    }

    private static string ResolveUploadPath(string webRoot, string url)
    {
        var uploadsRoot = Path.GetFullPath(Path.Combine(webRoot, "uploads")) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(webRoot, url.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
        if (!path.StartsWith(uploadsRoot, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Image path is outside the upload directory.");
        return path;
    }

    private static string ToPublicUrl(string webRoot, string path) =>
        "/" + Path.GetRelativePath(webRoot, path).Replace(Path.DirectorySeparatorChar, '/');
}
