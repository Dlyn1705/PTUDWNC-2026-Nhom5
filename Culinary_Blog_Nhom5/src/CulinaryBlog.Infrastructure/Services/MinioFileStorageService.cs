using CulinaryBlog.Application.Contracts;
using Microsoft.Extensions.Options;
using Minio;
using Minio.DataModel.Args;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class MinioOptions
{
    public const string SectionName = "Minio";
    public string Endpoint { get; set; } = "localhost:9000";
    public string PublicBaseUrl { get; set; } = "http://localhost:9000";
    public string Bucket { get; set; } = "culinary-images";
    public string AccessKey { get; set; } = string.Empty;
    public string SecretKey { get; set; } = string.Empty;
    public bool UseSSL { get; set; }
}

public sealed class MinioFileStorageService : IFileStorageService
{
    private readonly IMinioClient _client;
    private readonly MinioOptions _options;

    public MinioFileStorageService(IMinioClient client, IOptions<MinioOptions> options)
    {
        _client = client;
        _options = options.Value;
    }

    public async Task<bool> IsReadyAsync(CancellationToken ct = default)
    {
        try
        {
            await EnsureBucketAsync(ct);
            return true;
        }
        catch { return false; }
    }

    public async Task<string> UploadAsync(Stream stream, string objectKey, string contentType, CancellationToken ct = default)
    {
        await EnsureBucketAsync(ct);
        if (stream.CanSeek) stream.Position = 0;
        var size = stream.CanSeek ? stream.Length : throw new InvalidOperationException("MinIO upload stream must be seekable.");
        var args = new PutObjectArgs()
            .WithBucket(_options.Bucket)
            .WithObject(objectKey)
            .WithStreamData(stream)
            .WithObjectSize(size)
            .WithContentType(contentType);
        await _client.PutObjectAsync(args, ct);
        return BuildUrl(objectKey);
    }

    public async Task<Stream> OpenReadAsync(string fileUrl, CancellationToken ct = default)
    {
        var key = GetObjectKey(fileUrl);
        var output = new MemoryStream();
        var args = new GetObjectArgs()
            .WithBucket(_options.Bucket)
            .WithObject(key)
            .WithCallbackStream(source => source.CopyTo(output));
        await _client.GetObjectAsync(args, ct);
        output.Position = 0;
        return output;
    }

    public async Task DeleteAsync(string fileUrl, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileUrl)) return;
        await _client.RemoveObjectAsync(new RemoveObjectArgs()
            .WithBucket(_options.Bucket)
            .WithObject(GetObjectKey(fileUrl)), ct);
    }

    private async Task EnsureBucketAsync(CancellationToken ct)
    {
        var exists = await _client.BucketExistsAsync(new BucketExistsArgs().WithBucket(_options.Bucket), ct);
        if (!exists)
        {
            try { await _client.MakeBucketAsync(new MakeBucketArgs().WithBucket(_options.Bucket), ct); }
            catch
            {
                if (!await _client.BucketExistsAsync(new BucketExistsArgs().WithBucket(_options.Bucket), ct)) throw;
            }
        }
        var readOnlyPolicy = $$"""
        {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::{{_options.Bucket}}/recipes/*"]}]}
        """;
        await _client.SetPolicyAsync(new SetPolicyArgs().WithBucket(_options.Bucket).WithPolicy(readOnlyPolicy), ct);
    }

    private string BuildUrl(string key) => $"{_options.PublicBaseUrl.TrimEnd('/')}/{_options.Bucket}/{string.Join('/', key.Split('/').Select(Uri.EscapeDataString))}";

    private string GetObjectKey(string url)
    {
        var uri = Uri.TryCreate(url, UriKind.Absolute, out var parsed) ? parsed : new Uri(new Uri(_options.PublicBaseUrl.TrimEnd('/') + "/"), url.TrimStart('/'));
        var path = Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/');
        var prefix = _options.Bucket + "/";
        if (!path.StartsWith(prefix, StringComparison.Ordinal)) throw new ArgumentException("URL does not belong to the configured image bucket.", nameof(url));
        return path[prefix.Length..];
    }
}
