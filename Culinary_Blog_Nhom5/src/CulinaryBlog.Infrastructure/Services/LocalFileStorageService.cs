using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using Microsoft.AspNetCore.Hosting;

namespace CulinaryBlog.Infrastructure.Services;

public class LocalFileStorageService : IFileStorageService
{
    private readonly IWebHostEnvironment _environment;

    public LocalFileStorageService(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    public async Task<string> UploadAsync(Stream stream, string fileName, string contentType, string folder, CancellationToken ct = default)
    {
        string extension = Path.GetExtension(fileName);
        string uniqueFileName = $"{Guid.NewGuid()}{extension}";
        
        string webRoot = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        string uploadsRoot = Path.GetFullPath(Path.Combine(webRoot, "uploads")) + Path.DirectorySeparatorChar;
        string targetDirectory = Path.GetFullPath(Path.Combine(uploadsRoot, folder));
        if (!targetDirectory.StartsWith(uploadsRoot, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Upload path must stay inside the uploads directory.");

        if (!Directory.Exists(targetDirectory))
        {
            Directory.CreateDirectory(targetDirectory);
        }

        string fullPath = Path.Combine(targetDirectory, uniqueFileName);
        using (var fileStream = new FileStream(fullPath, FileMode.Create))
        {
            await stream.CopyToAsync(fileStream, ct);
        }

        return $"/uploads/{folder}/{uniqueFileName}";
    }

    public Task DeleteAsync(string fileUrl, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileUrl)) return Task.CompletedTask;

        string webRoot = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        string uploadsRoot = Path.GetFullPath(Path.Combine(webRoot, "uploads")) + Path.DirectorySeparatorChar;
        string relativePath = fileUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        string fullPath = Path.GetFullPath(Path.Combine(webRoot, relativePath));
        if (!fullPath.StartsWith(uploadsRoot, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Delete path must stay inside the uploads directory.");

        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }

        return Task.CompletedTask;
    }
}
