using CulinaryBlog.Application.Contracts;
using Microsoft.Extensions.Options;

namespace CulinaryBlog.Infrastructure.Services.Images;

public sealed class ImageVariantStorage(IFileStorageService storage, IOptions<MinioOptions> settings)
{
    public string Url(string key) => $"{settings.Value.PublicBaseUrl.TrimEnd('/')}/{settings.Value.Bucket}/{key}";

    public void ValidateOriginal(Guid recipeId, string url)
    {
        var prefix = Url($"recipes/{recipeId}/");
        if (!url.StartsWith(prefix, StringComparison.Ordinal)) throw new InvalidDataException("InvalidOriginalKey");
        var filename = url[prefix.Length..];
        if (!Guid.TryParseExact(Path.GetFileNameWithoutExtension(filename), "N", out _) ||
            Path.GetExtension(filename).ToLowerInvariant() is not (".jpg" or ".jpeg" or ".png" or ".webp" or ".avif") ||
            filename.Contains('/') || filename.Contains('\\')) throw new InvalidDataException("InvalidOriginalKey");
    }

    public Task DeleteAsync(string key, CancellationToken ct) => storage.DeleteAsync(Url(key), ct);
}
