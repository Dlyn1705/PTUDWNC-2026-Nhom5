using CulinaryBlog.Domain.Exceptions;

namespace CulinaryBlog.Application.Features.Recipes.Commands.UploadRecipeImage;

public static class ImageFileValidation
{
    public static async Task<(string Extension, string ContentType)> DetectAsync(
        Stream stream, string fileName, string declaredType, CancellationToken ct)
    {
        if (!stream.CanSeek) throw new ValidationException("file", "Không thể đọc file được gửi lên.");
        stream.Position = 0;
        var header = new byte[Math.Min(32, (int)Math.Min(stream.Length, 32))];
        var read = await stream.ReadAsync(header.AsMemory(), ct);
        stream.Position = 0;
        var bytes = header.AsSpan(0, read);
        (string ext, string mime)? detected = null;
        var hasAvifBrand = false;
        for (var offset = 8; offset + 4 <= read; offset += 4)
        {
            if (bytes.Slice(offset, 4).SequenceEqual("avif"u8) || bytes.Slice(offset, 4).SequenceEqual("avis"u8))
            {
                hasAvifBrand = true;
                break;
            }
        }

        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) detected = ("jpg", "image/jpeg");
        else if (bytes.Length >= 8 && bytes[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) detected = ("png", "image/png");
        else if (bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes.Slice(8, 4).SequenceEqual("WEBP"u8)) detected = ("webp", "image/webp");
        else if (bytes.Length >= 12 && bytes.Slice(4, 4).SequenceEqual("ftyp"u8) && hasAvifBrand) detected = ("avif", "image/avif");

        if (detected is null) throw new ValidationException("file", "Nội dung không phải ảnh JPEG, PNG, WebP hoặc AVIF hợp lệ.");
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var extensionMatches = detected.Value.ext == "jpg" ? extension is ".jpg" or ".jpeg" : extension == "." + detected.Value.ext;
        if (!extensionMatches || !string.Equals(declaredType, detected.Value.mime, StringComparison.OrdinalIgnoreCase))
            throw new ValidationException("file", "Phần mở rộng hoặc MIME của file không khớp với nội dung ảnh.");
        return detected.Value;
    }
}
