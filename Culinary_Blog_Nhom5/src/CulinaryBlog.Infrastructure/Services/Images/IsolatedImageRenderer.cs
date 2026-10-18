using System.Diagnostics;
using ImageMagick;

namespace CulinaryBlog.Infrastructure.Services.Images;

public interface IImageVariantRenderer
{
    Task<(byte[] Medium, byte[] Thumbnail)> RenderAsync(Stream original, CancellationToken ct);
}

/// <summary>Native decoder never runs inside the HTTP/Hangfire process. Deadline kills the child tree.</summary>
public sealed class IsolatedImageRenderer : IImageVariantRenderer
{
    private static readonly SemaphoreSlim Slots = new(2);
    public const int MaximumBytes = 5 * 1024 * 1024;

    public async Task<(byte[] Medium, byte[] Thumbnail)> RenderAsync(Stream original, CancellationToken ct)
    {
        await Slots.WaitAsync(ct);
        var folder = Path.Combine(Path.GetTempPath(), "culinary-resize-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(folder);
            var input = Path.Combine(folder, "input");
            await using (var file = File.Create(input)) await CopyBoundedAsync(original, file, ct);
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
            deadline.CancelAfter(TimeSpan.FromSeconds(45));
            var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = folder,
                RedirectStandardOutput = true, RedirectStandardError = true };
            start.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory, "CulinaryBlog.API.dll"));
            start.ArgumentList.Add("--image-transform");
            start.ArgumentList.Add(input);
            start.ArgumentList.Add(Path.Combine(folder, "medium.jpg"));
            start.ArgumentList.Add(Path.Combine(folder, "thumbnail.jpg"));
            // Child has no need for application credentials or cloud SDK configuration.
            foreach (var key in start.Environment.Keys.Where(x => x.StartsWith("ConnectionStrings", StringComparison.OrdinalIgnoreCase) ||
                x.StartsWith("Jwt", StringComparison.OrdinalIgnoreCase) || x.StartsWith("Minio", StringComparison.OrdinalIgnoreCase) ||
                x.StartsWith("Email", StringComparison.OrdinalIgnoreCase)).ToArray()) start.Environment.Remove(key);
            start.Environment["MAGICK_TEMPORARY_PATH"] = folder;
            using var process = Process.Start(start) ?? throw new InvalidOperationException("ImageWorkerUnavailable");
            // Drain without persisting native decoder messages or untrusted metadata in application logs.
            var drains = Task.WhenAll(process.StandardOutput.BaseStream.CopyToAsync(Stream.Null), process.StandardError.BaseStream.CopyToAsync(Stream.Null));
            try { await ImageProcessSupervisor.WaitAsync(process, deadline.Token); }
            finally { await drains; }
            if (process.ExitCode == 2) throw new InvalidDataException("InvalidImage");
            if (process.ExitCode != 0) throw new InvalidOperationException("ImageWorkerFailure");
            return (await File.ReadAllBytesAsync(Path.Combine(folder, "medium.jpg"), ct),
                await File.ReadAllBytesAsync(Path.Combine(folder, "thumbnail.jpg"), ct));
        }
        finally
        {
            // Only our generated temp directory. The native process has exited before cleanup.
            try { if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true); } finally { Slots.Release(); }
        }
    }

    public static async Task CopyBoundedAsync(Stream source, Stream target, CancellationToken ct)
    {
        var buffer = new byte[65536]; var total = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, ct)) != 0)
        {
            total += read;
            if (total > MaximumBytes) throw new InvalidDataException("ImageTooLarge");
            await target.WriteAsync(buffer.AsMemory(0, read), ct);
        }
    }
}

public static class ImageProcessSupervisor
{
    public static async Task WaitAsync(Process process, CancellationToken ct)
    {
        try { await process.WaitForExitAsync(ct); }
        catch
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync(CancellationToken.None);
            throw;
        }
    }
}

public static class ImageTransformWorker
{
    public static int Run(string[] args)
    {
        if (args.Length != 4) return 2;
        try
        {
            // Fallback for an orphaned child after parent termination. It never performs MinIO writes.
            using var watchdog = new Timer(_ => Environment.Exit(3), null, TimeSpan.FromSeconds(50), Timeout.InfiniteTimeSpan);
            ResourceLimits.Width = 10_000; ResourceLimits.Height = 10_000;
            ResourceLimits.Area = 40_000_000; // Cache threshold, not a hard pixel rejection.
            ResourceLimits.Memory = 256 * 1024 * 1024;
            ResourceLimits.Disk = 256 * 1024 * 1024; ResourceLimits.Thread = 1;
            ResourceLimits.Time = 40; ResourceLimits.MaxMemoryRequest = 256 * 1024 * 1024;
            ResourceLimits.MaxProfileSize = 4 * 1024 * 1024; ResourceLimits.ListLength = 8;
            if (new FileInfo(args[1]).Length is <= 0 or > IsolatedImageRenderer.MaximumBytes) return 2;
            var settings = new MagickReadSettings { FrameIndex = 0, FrameCount = 1 };
            var header = new byte[32];
            using (var input = File.OpenRead(args[1])) _ = input.Read(header);
            // Force an allowlisted decoder before Ping: don't autodetect SVG/MSL/delegates from untrusted bytes.
            settings.Format = header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff ? MagickFormat.Jpeg :
                header.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ? MagickFormat.Png :
                header.AsSpan(0, 4).SequenceEqual("RIFF"u8) && header.AsSpan(8, 4).SequenceEqual("WEBP"u8) ? MagickFormat.WebP :
                header.AsSpan(4, 4).SequenceEqual("ftyp"u8) && Enumerable.Range(2, 6).Any(i => header.AsSpan(i * 4, 4).SequenceEqual("avif"u8) || header.AsSpan(i * 4, 4).SequenceEqual("avis"u8))
                    ? MagickFormat.Avif : throw new InvalidDataException("UnsupportedImage");
            using var image = new MagickImage();
            using (var input = File.OpenRead(args[1])) image.Ping(input, settings);
            if (image.Width == 0 || image.Height == 0 || (long)image.Width * image.Height > 40_000_000 ||
                image.Format is not (MagickFormat.Jpeg or MagickFormat.Png or MagickFormat.WebP or MagickFormat.Avif or MagickFormat.Heic)) return 2;
            using (var input = File.OpenRead(args[1])) image.Read(input, settings);
            if ((long)image.Width * image.Height > 40_000_000) return 2;
            image.AutoOrient();
            if (!image.TransformColorSpace(ColorProfiles.SRGB)) image.ColorSpace = ColorSpace.sRGB;
            image.BackgroundColor = MagickColors.White; image.Alpha(AlphaOption.Remove);
            image.Strip();
            Write(image, args[2], 800, 600); Write(image, args[3], 300, 300);
            return 0;
        }
        catch (MagickException) { return 2; }
        catch (InvalidDataException) { return 2; }
        catch { return 3; }
    }

    private static void Write(MagickImage image, string path, uint width, uint height)
    {
        using var variant = (MagickImage)image.Clone();
        variant.Resize(new MagickGeometry(width, height) { FillArea = true });
        variant.Crop(width, height, Gravity.Center); variant.ResetPage();
        variant.Format = MagickFormat.Jpeg; variant.Quality = 85; variant.Write(path);
    }
}
