using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.DTOs;

namespace CulinaryBlog.Application.Contracts;

public interface IAuthService
{
    Task<AuthResponseDto> RegisterAsync(string email, string displayName, string password, CancellationToken cancellationToken);
    Task<AuthResponseDto> LoginAsync(string email, string password, CancellationToken cancellationToken);
    Task<AuthResponseDto> LoginWithGoogleIdTokenAsync(string idToken, CancellationToken cancellationToken);
    Task<AuthResponseDto> RefreshAsync(string refreshToken, CancellationToken cancellationToken);
    Task<RefreshTokenRevocationResult> RevokeRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken);
    Task<RefreshTokenRevocationResult> RevokeRefreshTokenAsync(
        string refreshToken,
        string? expectedUserId,
        CancellationToken cancellationToken);
}

/// <summary>
/// Internal result of a logout revocation attempt. The API intentionally maps
/// non-success outcomes to explicit authorization or non-disclosing responses as appropriate.
/// </summary>
public enum RefreshTokenRevocationResult
{
    Revoked,
    NotFound,
    OwnershipMismatch,
    Expired,
    Forbidden
}
