namespace CulinaryBlog.API.Logging;

public sealed class LogFileOptions
{
    public bool Enabled { get; set; } = true;
    public string Directory { get; set; } = "logs";
    public string InstanceName { get; set; } = "api";
    public int RetainedFileCountLimit { get; set; } = 14;
    public long FileSizeLimitBytes { get; set; } = 20 * 1024 * 1024;

    public string FilePath(string contentRoot, string? webRoot)
    {
        if (string.IsNullOrWhiteSpace(Directory) || RetainedFileCountLimit < 1 || FileSizeLimitBytes < 1024
            || string.IsNullOrWhiteSpace(InstanceName) || InstanceName.Length > 64
            || InstanceName.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_')))
            throw new InvalidOperationException("Invalid Observability:File configuration.");
        var directory = Path.GetFullPath(Directory, contentRoot);
        var publicRoot = Path.GetFullPath(webRoot ?? Path.Combine(contentRoot, "wwwroot"));
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (directory.Equals(publicRoot, comparison) || directory.StartsWith(publicRoot + Path.DirectorySeparatorChar, comparison))
            throw new InvalidOperationException("Log files must not be written under wwwroot.");
        System.IO.Directory.CreateDirectory(directory);
        using (new FileStream(Path.Combine(directory, ".write-test-" + Guid.NewGuid().ToString("N")),
            FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.DeleteOnClose)) { }
        return Path.Combine(directory, $"culinary-{InstanceName}-.json");
    }
}
