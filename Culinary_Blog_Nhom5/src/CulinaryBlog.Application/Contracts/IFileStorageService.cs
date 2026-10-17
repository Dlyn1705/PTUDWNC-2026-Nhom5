using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace CulinaryBlog.Application.Contracts;

public interface IFileStorageService
{
    Task<bool> IsReadyAsync(CancellationToken ct = default);
    Task<string> UploadAsync(Stream stream, string objectKey, string contentType, CancellationToken ct = default);
    Task<Stream> OpenReadAsync(string fileUrl, CancellationToken ct = default);
    Task DeleteAsync(string fileUrl, CancellationToken ct = default);
}
