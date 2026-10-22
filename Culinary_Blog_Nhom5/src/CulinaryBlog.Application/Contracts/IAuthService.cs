using System.Threading;
using System.Threading.Tasks;
using System.IO;
using CulinaryBlog.Application.DTOs;

namespace CulinaryBlog.Application.Contracts;

public interface IAuthService
{
    Task<AuthResponseDto> RegisterAsync(string email, string displayName, string password, CancellationToken cancellationToken);
    Task<AuthResponseDto> LoginAsync(string email, string password, CancellationToken cancellationToken);
    Task<AuthResponseDto> LoginWithGoogleIdTokenAsync(string idToken, CancellationToken cancellationToken);
    Task<AuthResponseDto> RefreshAsync(string refreshToken, CancellationToken cancellationToken);
    Task<UserDto> GetProfileAsync(string userId, CancellationToken cancellationToken);
    Task<UserDto> UpdateProfileAsync(string userId, string? displayName, string? bio, CancellationToken cancellationToken);
    Task<UserDto> UpdateAvatarAsync(string userId, Stream image, long length, string contentType, CancellationToken cancellationToken);
    Task ChangePasswordAsync(string userId, string currentPassword, string newPassword, CancellationToken cancellationToken);
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
