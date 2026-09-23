using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.DTOs;

namespace CulinaryBlog.Application.Contracts;

public interface IAuthService
{
    Task<AuthResponseDto> RegisterAsync(string email, string displayName, string password, CancellationToken cancellationToken);
}