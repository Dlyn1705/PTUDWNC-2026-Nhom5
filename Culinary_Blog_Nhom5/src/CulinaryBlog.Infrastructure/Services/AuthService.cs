using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Services.Images;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class AuthService : IAuthService
{
    private const string AuthorRole = "Author";

    private readonly ApplicationDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly RoleManager<IdentityRole> _roleManager;
    private readonly IJwtService _jwtService;
    private readonly IConfiguration _configuration;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuthService> _logger;
    private readonly TimeProvider _timeProvider;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IFileStorageService _fileStorageService;
    private readonly IImageVariantRenderer _imageVariantRenderer;

    public AuthService(
        ApplicationDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        RoleManager<IdentityRole> roleManager,
        IJwtService jwtService,
        IConfiguration configuration,
        IHttpContextAccessor httpContextAccessor,
        ILogger<AuthService> logger,
        TimeProvider timeProvider,
        IServiceScopeFactory scopeFactory,
        IFileStorageService fileStorageService,
        IImageVariantRenderer imageVariantRenderer)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _signInManager = signInManager;
        _roleManager = roleManager;
        _jwtService = jwtService;
        _configuration = configuration;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
        _timeProvider = timeProvider;
        _scopeFactory = scopeFactory;
        _fileStorageService = fileStorageService;
        _imageVariantRenderer = imageVariantRenderer;
    }

    public Task<AuthResponseDto> RegisterAsync(string email, string displayName, string password, CancellationToken cancellationToken)
    {
        var userId = Guid.NewGuid().ToString();
        var refreshToken = _jwtService.GenerateRefreshToken();
        return ExecuteResilientAsync(
            service => service.RegisterCoreAsync(email, displayName, password, userId, refreshToken, cancellationToken),
            cancellationToken);
    }

    public async Task<UserDto> GetProfileAsync(string userId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null || !user.IsActive)
            throw new UnauthorizedAccessException("Tài khoản không khả dụng.");

        return ToUserDto(user);
    }

    public async Task<UserDto> UpdateProfileAsync(
        string userId,
        string? displayName,
        string? bio,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var normalizedName = displayName?.Trim();
        if (displayName is not null
            && (string.IsNullOrWhiteSpace(normalizedName) || normalizedName.Length is < 2 or > 100))
            throw new ValidationException("displayName", "Tên hiển thị phải có từ 2 đến 100 ký tự.");
        if (bio?.Length > 500)
            throw new ValidationException("bio", "Giới thiệu không được vượt quá 500 ký tự.");

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null || !user.IsActive)
            throw new UnauthorizedAccessException("Tài khoản không khả dụng.");

        if (normalizedName is not null)
            user.DisplayName = normalizedName;
        if (bio is not null)
            user.Bio = string.IsNullOrWhiteSpace(bio) ? null : bio.Trim();
        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            throw new ValidationException(result.Errors
                .GroupBy(_ => "profile")
                .ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray()));
        }

        return ToUserDto(user);
    }

    public async Task<UserDto> UpdateAvatarAsync(
        string userId,
        Stream image,
        long length,
        string contentType,
        CancellationToken cancellationToken)
    {
        if (length is <= 0 or > IsolatedImageRenderer.MaximumBytes)
            throw new ValidationException("file", "Ảnh đại diện phải có dung lượng từ 1 byte đến 5 MiB.");
        ValidateAvatarContent(image, contentType);

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null || !user.IsActive)
            throw new UnauthorizedAccessException("Tài khoản không khả dụng.");

        (byte[] Medium, byte[] Thumbnail) rendered;
        try
        {
            rendered = await _imageVariantRenderer.RenderAsync(image, cancellationToken);
        }
        catch (InvalidDataException)
        {
            throw new ValidationException("file", "Ảnh đại diện không hợp lệ hoặc không được hỗ trợ.");
        }

        var objectKey = $"users/{userId}/avatar/{Guid.NewGuid():N}.jpg";
        await using var thumbnailStream = new MemoryStream(rendered.Thumbnail, writable: false);
        var avatarUrl = await _fileStorageService.UploadAsync(
            thumbnailStream, objectKey, "image/jpeg", cancellationToken);

        var previousAvatarUrl = user.AvatarUrl;
        user.AvatarUrl = avatarUrl;
        var updateResult = await _userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            try { await _fileStorageService.DeleteAsync(avatarUrl, CancellationToken.None); }
            catch (Exception cleanupError)
            {
                _logger.LogWarning(cleanupError, "Could not remove an unused avatar object for user {UserId}", userId);
            }

            throw new ValidationException(updateResult.Errors
                .GroupBy(_ => "avatar")
                .ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray()));
        }

        if (IsOwnedAvatar(previousAvatarUrl, userId))
        {
            try { await _fileStorageService.DeleteAsync(previousAvatarUrl!, cancellationToken); }
            catch (Exception cleanupError)
            {
                _logger.LogWarning(cleanupError, "Could not remove a replaced avatar object for user {UserId}", userId);
            }
        }

        return ToUserDto(user);
    }

    public async Task ChangePasswordAsync(
        string userId,
        string currentPassword,
        string newPassword,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(currentPassword))
            throw new ValidationException("currentPassword", "Mật khẩu hiện tại là bắt buộc.");
        if (string.IsNullOrWhiteSpace(newPassword))
            throw new ValidationException("newPassword", "Mật khẩu mới là bắt buộc.");

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null || !user.IsActive)
            throw new UnauthorizedAccessException("Tài khoản không khả dụng.");

        var result = await _userManager.ChangePasswordAsync(user, currentPassword, newPassword);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(error => error.Code == "PasswordMismatch"))
                throw new ValidationException("currentPassword", "Mật khẩu hiện tại không chính xác.");

            throw new ValidationException(result.Errors
                .GroupBy(error => error.Code.StartsWith("Password", StringComparison.OrdinalIgnoreCase)
                    ? "newPassword"
                    : "currentPassword")
                .ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray()));
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        await _dbContext.RefreshTokens
            .Where(token => token.UserId == userId && token.RevokedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(token => token.RevokedAt, now), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private static UserDto ToUserDto(ApplicationUser user) =>
        new(user.Id, user.Email ?? string.Empty, user.DisplayName, user.AvatarUrl, user.Bio);

    private static void ValidateAvatarContent(Stream image, string contentType)
    {
        if (!image.CanSeek)
            throw new ValidationException("file", "Không thể đọc file ảnh được gửi lên.");

        image.Position = 0;
        var header = new byte[Math.Min(32, (int)Math.Min(image.Length, 32))];
        var read = image.Read(header, 0, header.Length);
        image.Position = 0;
        var bytes = header.AsSpan(0, read);
        var hasAvifBrand = false;
        for (var offset = 8; offset + 4 <= read; offset += 4)
        {
            if (bytes.Slice(offset, 4).SequenceEqual("avif"u8)
                || bytes.Slice(offset, 4).SequenceEqual("avis"u8))
            {
                hasAvifBrand = true;
                break;
            }
        }

        var detected = bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF
            ? "image/jpeg"
            : bytes.Length >= 8 && bytes[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })
                ? "image/png"
                : bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes.Slice(8, 4).SequenceEqual("WEBP"u8)
                    ? "image/webp"
                    : bytes.Length >= 12 && bytes.Slice(4, 4).SequenceEqual("ftyp"u8) && hasAvifBrand
                        ? "image/avif"
                        : null;

        if (detected is null || !string.Equals(contentType, detected, StringComparison.OrdinalIgnoreCase))
            throw new ValidationException("file", "Nội dung không phải ảnh JPEG, PNG, WebP hoặc AVIF hợp lệ.");
    }

    private static bool IsOwnedAvatar(string? url, string userId) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && uri.AbsolutePath.Contains($"/users/{Uri.EscapeDataString(userId)}/avatar/", StringComparison.Ordinal);

    private async Task<AuthResponseDto> RegisterLegacyAsync(string email, string displayName, string password, CancellationToken cancellationToken)
    {
        return await _dbContext.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            _dbContext.ChangeTracker.Clear();
            await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
            var normalizedEmail = email.Trim();
            if (await _userManager.FindByEmailAsync(normalizedEmail) is not null)
            {
                throw new ConflictException("Email đã được sử dụng.", "AUTH_EMAIL_EXISTS");
            }

            var user = ApplicationUser.Create(normalizedEmail, normalizedEmail, displayName.Trim());
            var createResult = await _userManager.CreateAsync(user, password);
            if (!createResult.Succeeded)
            {
                var errors = createResult.Errors
                    .GroupBy(error => error.Code.StartsWith("Password", StringComparison.OrdinalIgnoreCase) ? "Password" : "Register")
                    .ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray());
                throw new ValidationException(errors);
            }

            if (!await _roleManager.RoleExistsAsync(AuthorRole))
            {
                var roleResult = await _roleManager.CreateAsync(new IdentityRole(AuthorRole));
                if (!roleResult.Succeeded)
                {
                    throw new DbUpdateException("Không thể khởi tạo vai trò người dùng.");
                }
            }

            var roleAssignment = await _userManager.AddToRoleAsync(user, AuthorRole);
            if (!roleAssignment.Succeeded)
            {
                throw new DbUpdateException("Không thể gán vai trò cho tài khoản mới.");
            }

            _dbContext.WelcomeEmailDeliveries.Add(WelcomeEmailDelivery.Create(user));
            var response = await CreateAuthResponseAsync(user, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            _logger.LogInformation(
                "Audit auth registration succeeded for user {UserId} at {OccurredAtUtc}",
                user.Id,
                DateTimeOffset.UtcNow);
            return response;
        });
    }

    // Kept as a separate transaction core so execution-strategy retries can
    // recognize a previously committed registration by its stable id/token.
    private async Task<AuthResponseDto> RegisterCoreAsync(
        string email, string displayName, string password, string userId,
        (string RawToken, string TokenHash) refreshToken, CancellationToken cancellationToken)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        var committedUser = await _userManager.FindByIdAsync(userId);
        if (committedUser is not null)
        {
            var committedToken = await _dbContext.RefreshTokens.AsNoTracking()
                .SingleOrDefaultAsync(token => token.UserId == userId && token.TokenHash == refreshToken.TokenHash, cancellationToken);
            if (committedToken is not null)
                return await BuildAuthResponseAsync(committedUser, refreshToken.RawToken, committedToken.ExpiresAt);
        }

        var normalizedEmail = email.Trim();
        if (await _userManager.FindByEmailAsync(normalizedEmail) is not null)
            throw new ConflictException("Email đã được sử dụng.", "AUTH_EMAIL_EXISTS");

        var user = ApplicationUser.Create(normalizedEmail, normalizedEmail, displayName.Trim());
        user.Id = userId;
        var createResult = await _userManager.CreateAsync(user, password);
        if (!createResult.Succeeded)
        {
            if (createResult.Errors.Any(error => error.Code is "DuplicateEmail" or "DuplicateUserName"))
                throw new ConflictException("Email đã được sử dụng.", "AUTH_EMAIL_EXISTS");
            var errors = createResult.Errors
                .GroupBy(error => error.Code.StartsWith("Password", StringComparison.OrdinalIgnoreCase) ? "Password" : "Register")
                .ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray());
            throw new ValidationException(errors);
        }

        await EnsureAuthorRoleAsync(user);
        _dbContext.WelcomeEmailDeliveries.Add(WelcomeEmailDelivery.Create(user));
        var response = await CreateAuthResponseAsync(user, cancellationToken, refreshToken);
        await transaction.CommitAsync(cancellationToken);
        return response;
    }

    public async Task<AuthResponseDto> LoginAsync(string email, string password, CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByEmailAsync(email.Trim());
        if (user is null || !user.IsActive)
        {
            throw new UnauthorizedAccessException("Email hoặc mật khẩu không chính xác.");
        }

        if (await _userManager.IsLockedOutAsync(user))
        {
            throw new LockedException();
        }

        var result = await _signInManager.CheckPasswordSignInAsync(user, password, lockoutOnFailure: true);
        if (result.IsLockedOut)
        {
            throw new LockedException("Tài khoản bị tạm khóa sau quá nhiều lần đăng nhập thất bại.");
        }

        if (!result.Succeeded)
        {
            throw new UnauthorizedAccessException("Email hoặc mật khẩu không chính xác.");
        }

        var response = await CreateAuthResponseAsync(user, cancellationToken);
        _logger.LogInformation(
            "Audit auth login succeeded for user {UserId} at {OccurredAtUtc}",
            user.Id,
            DateTimeOffset.UtcNow);
        return response;
    }

    public async Task<AuthResponseDto> LoginWithGoogleIdTokenAsync(
        string idToken,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var clientId = _configuration["Authentication:Google:ClientId"];
        if (string.IsNullOrWhiteSpace(clientId))
        {
            throw new ExternalServiceException("Google token verification is not configured on the server.");
        }

        GoogleJsonWebSignature.Payload payload;
        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(
                idToken,
                new GoogleJsonWebSignature.ValidationSettings
                {
                    Audience = [clientId]
                });
        }
        catch (InvalidJwtException)
        {
            throw new UnauthorizedAccessException("Google ID token is invalid or expired.");
        }
        catch (Exception exception) when (
            exception is HttpRequestException
            || exception is TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Google token verification service is unavailable at {OccurredAtUtc}", DateTimeOffset.UtcNow);
            throw new ExternalServiceException("Google token verification service is temporarily unavailable.");
        }

        cancellationToken.ThrowIfCancellationRequested();
        if (!payload.EmailVerified || string.IsNullOrWhiteSpace(payload.Email) || string.IsNullOrWhiteSpace(payload.Subject))
        {
            throw new UnauthorizedAccessException("Google did not provide a verified account.");
        }

        const string loginProvider = "Google";
        var email = payload.Email.Trim();
        var displayName = string.IsNullOrWhiteSpace(payload.Name)
            ? email.Split('@', 2)[0]
            : payload.Name.Trim();
        displayName = displayName[..Math.Min(displayName.Length, 100)];
        var avatarUrl = payload.Picture?.Length <= 500 ? payload.Picture : null;

        return await _dbContext.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            _dbContext.ChangeTracker.Clear();
            await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
            var user = await _userManager.FindByLoginAsync(loginProvider, payload.Subject);

            if (user is null)
            {
                user = await _userManager.FindByEmailAsync(email);
                if (user is null)
                {
                    user = ApplicationUser.Create(email, email, displayName, avatarUrl);
                    user.EmailConfirmed = true;

                    var createResult = await _userManager.CreateAsync(user);
                    if (!createResult.Succeeded)
                    {
                        throw new ConflictException(
                            "Could not create an account from the Google profile.",
                            "GOOGLE_ACCOUNT_CREATE_FAILED");
                    }

                    await EnsureAuthorRoleAsync(user);
                    _dbContext.WelcomeEmailDeliveries.Add(WelcomeEmailDelivery.Create(user));
                }
                else if (!user.IsActive)
                {
                    throw new UnauthorizedAccessException("The account is not available.");
                }

                var addLoginResult = await _userManager.AddLoginAsync(
                    user,
                    new UserLoginInfo(loginProvider, payload.Subject, loginProvider));
                if (!addLoginResult.Succeeded)
                {
                    throw new ConflictException(
                        "The Google account is already linked to another account.",
                        "GOOGLE_LOGIN_ALREADY_LINKED");
                }
            }
            else if (!user.IsActive)
            {
                throw new UnauthorizedAccessException("The account is not available.");
            }

            var response = await CreateAuthResponseAsync(user, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            _logger.LogInformation(
                "Audit Google sign-in succeeded for user {UserId} at {OccurredAtUtc}",
                user.Id,
                DateTimeOffset.UtcNow);
            return response;
        });
    }

    private async Task<AuthResponseDto> GoogleLoginCoreAsync(
        string loginProvider, string subject, string email, string displayName, string? avatarUrl,
        (string RawToken, string TokenHash) refreshToken, CancellationToken cancellationToken)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        var user = await _userManager.FindByLoginAsync(loginProvider, subject);
        if (user is not null)
        {
            var committedToken = await _dbContext.RefreshTokens.AsNoTracking()
                .SingleOrDefaultAsync(token => token.UserId == user.Id && token.TokenHash == refreshToken.TokenHash, cancellationToken);
            if (committedToken is not null)
                return await BuildAuthResponseAsync(user, refreshToken.RawToken, committedToken.ExpiresAt);
        }

        if (user is null)
        {
            user = await _userManager.FindByEmailAsync(email);
            if (user is null)
            {
                user = ApplicationUser.Create(email, email, displayName, avatarUrl);
                user.EmailConfirmed = true;
                var createResult = await _userManager.CreateAsync(user);
                if (!createResult.Succeeded)
                    throw new ConflictException("Could not create an account from the Google profile.", "GOOGLE_ACCOUNT_CREATE_FAILED");

                await EnsureAuthorRoleAsync(user);
                _dbContext.WelcomeEmailDeliveries.Add(WelcomeEmailDelivery.Create(user));
            }
            else if (!user.IsActive)
            {
                throw new UnauthorizedAccessException("The account is not available.");
            }

            var addLoginResult = await _userManager.AddLoginAsync(
                user, new UserLoginInfo(loginProvider, subject, loginProvider));
            if (!addLoginResult.Succeeded)
                throw new ConflictException("The Google account is already linked to another account.", "GOOGLE_LOGIN_ALREADY_LINKED");
        }
        else if (!user.IsActive)
        {
            throw new UnauthorizedAccessException("The account is not available.");
        }

        var response = await CreateAuthResponseAsync(user, cancellationToken, refreshToken);
        await transaction.CommitAsync(cancellationToken);
        return response;
    }

    public async Task<AuthResponseDto> RefreshAsync(string refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
        }

        var tokenHash = _jwtService.HashToken(refreshToken);
        var (newRefreshToken, newRefreshTokenHash) = _jwtService.GenerateRefreshToken();
        var newTokenId = Guid.NewGuid();
        AuthResponseDto? preparedResponse = null;
        var strategy = _dbContext.Database.CreateExecutionStrategy();
        var outcome = await strategy.ExecuteAsync(async () =>
        {
            // An execution-strategy retry must not retain an Added token from a rolled-back attempt.
            _dbContext.ChangeTracker.Clear();
            await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
            var storedToken = await _dbContext.RefreshTokens.AsNoTracking()
                .SingleOrDefaultAsync(token => token.TokenHash == tokenHash, cancellationToken);
            if (storedToken is null) return (Response: (AuthResponseDto?)null, Failure: "invalid");

            // Serialize the whole account's token chain, including a replay racing a descendant's refresh.
            var user = await LockUserAsync(storedToken.UserId, cancellationToken);
            storedToken = await _dbContext.RefreshTokens.AsNoTracking()
                .SingleOrDefaultAsync(token => token.TokenHash == tokenHash, cancellationToken);
            if (storedToken is null) return (Response: (AuthResponseDto?)null, Failure: "invalid");
            var now = _timeProvider.GetUtcNow().UtcDateTime;

            // Recover only our own committed attempt after an ambiguous commit, never a new HTTP replay.
            if (preparedResponse is not null && storedToken.ReplacedByTokenHash == newRefreshTokenHash
                && user is { IsActive: true } && !await _userManager.IsLockedOutAsync(user)
                && await _dbContext.RefreshTokens.AsNoTracking().AnyAsync(token => token.Id == newTokenId
                    && token.TokenHash == newRefreshTokenHash && token.RevokedAt == null && !token.IsUsed
                    && token.ReplacedByTokenHash == null && token.ExpiresAt > now, cancellationToken))
            {
                await transaction.CommitAsync(cancellationToken);
                return (Response: preparedResponse, Failure: "");
            }

            if (storedToken.IsRevoked || storedToken.IsUsed || storedToken.ReplacedByTokenHash is not null)
            {
                await RevokeActiveTokensAsync(storedToken.UserId, now, cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                _logger.LogWarning("Refresh token reuse detected for user {UserId}", storedToken.UserId);
                return (Response: (AuthResponseDto?)null, Failure: "reuse");
            }

            if (storedToken.ExpiresAt <= now) return (Response: (AuthResponseDto?)null, Failure: "invalid");
            var locked = user is not null && await _userManager.IsLockedOutAsync(user);
            if (user is null || !user.IsActive || locked)
            {
                await RevokeActiveTokensAsync(storedToken.UserId, now, cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return (Response: (AuthResponseDto?)null, Failure: locked ? "locked" : "invalid");
            }

            var roles = await _userManager.GetRolesAsync(user);
            var (accessToken, accessTokenExpiry) = _jwtService.GenerateAccessToken(user, roles);
            var refreshTokenExpiry = now.AddDays(_configuration.GetValue("Jwt:RefreshTokenDurationInDays", 7));
            preparedResponse = new AuthResponseDto(accessToken, newRefreshToken, accessTokenExpiry,
                refreshTokenExpiry, new UserDto(user.Id, user.Email!, user.DisplayName), roles.ToArray());

            var updatedCount = await _dbContext.RefreshTokens
                .Where(token => token.Id == storedToken.Id && token.RevokedAt == null && !token.IsUsed
                    && token.ReplacedByTokenHash == null && token.ExpiresAt > now)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(token => token.IsUsed, true)
                    .SetProperty(token => token.RevokedAt, now)
                    .SetProperty(token => token.ReplacedByTokenHash, newRefreshTokenHash), cancellationToken);
            if (updatedCount != 1)
            {
                await RevokeActiveTokensAsync(storedToken.UserId, now, cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return (Response: (AuthResponseDto?)null, Failure: "reuse");
            }

            _dbContext.RefreshTokens.Add(new RefreshToken
            {
                Id = newTokenId,
                UserId = user.Id,
                TokenHash = newRefreshTokenHash,
                CreatedAt = now,
                ExpiresAt = refreshTokenExpiry,
                CreatedByIp = _httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString()
            });
            await _dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return (Response: preparedResponse, Failure: "");
        });

        // Security changes must commit before the endpoint receives an authentication error.
        if (outcome.Failure == "locked") throw new LockedException();
        if (outcome.Response is null)
            throw new UnauthorizedAccessException("Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.");
        _logger.LogInformation(
            "Audit auth refresh succeeded for user {UserId} at {OccurredAtUtc}",
            outcome.Response.User.Id, _timeProvider.GetUtcNow());
        return outcome.Response;
    }

    public Task<RefreshTokenRevocationResult> RevokeRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken)
    {
        return RevokeRefreshTokenAsync(refreshToken, expectedUserId: null, cancellationToken);
    }

    public async Task<RefreshTokenRevocationResult> RevokeRefreshTokenAsync(
        string refreshToken,
        string? expectedUserId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken)) return RefreshTokenRevocationResult.NotFound;
        var tokenHash = _jwtService.HashToken(refreshToken);
        return await _dbContext.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
            var token = await _dbContext.RefreshTokens.AsNoTracking()
                .SingleOrDefaultAsync(token => token.TokenHash == tokenHash, cancellationToken);
            if (token is null) return RefreshTokenRevocationResult.NotFound;
            if (expectedUserId is not null && token.UserId != expectedUserId)
                return RefreshTokenRevocationResult.OwnershipMismatch;

            var user = await LockUserAsync(token.UserId, cancellationToken);
            if (user is null) return RefreshTokenRevocationResult.NotFound;

            var roles = await _userManager.GetRolesAsync(user);
            if (!roles.Any(role =>
                string.Equals(role, "Author", StringComparison.OrdinalIgnoreCase)
                || string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase)))
            {
                return RefreshTokenRevocationResult.Forbidden;
            }

            if (token.ExpiresAt <= _timeProvider.GetUtcNow().UtcDateTime)
                return RefreshTokenRevocationResult.Expired;
            var now = _timeProvider.GetUtcNow().UtcDateTime;
            // A logout carrying an older cookie also revokes its successors without marking them used.
            await _dbContext.Database.ExecuteSqlInterpolatedAsync($"""
                WITH RECURSIVE chain AS (
                    SELECT "TokenHash", "ReplacedByTokenHash" FROM "RefreshTokens"
                    WHERE "TokenHash" = {tokenHash} AND "UserId" = {token.UserId}
                    UNION
                    SELECT child."TokenHash", child."ReplacedByTokenHash" FROM "RefreshTokens" child
                    JOIN chain parent ON child."TokenHash" = parent."ReplacedByTokenHash"
                    WHERE child."UserId" = {token.UserId}
                )
                UPDATE "RefreshTokens" SET "RevokedAt" = COALESCE("RevokedAt", {now})
                WHERE "TokenHash" IN (SELECT "TokenHash" FROM chain)
                """, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            _logger.LogInformation(
                "Audit auth logout succeeded for user {UserId} at {OccurredAtUtc}",
                token.UserId, _timeProvider.GetUtcNow());
            return RefreshTokenRevocationResult.Revoked;
        });
    }

    private Task<ApplicationUser?> LockUserAsync(string userId, CancellationToken cancellationToken) =>
        _dbContext.Users.FromSqlInterpolated($"""SELECT * FROM "AspNetUsers" WHERE "Id" = {userId} FOR UPDATE""")
            .AsNoTracking().SingleOrDefaultAsync(cancellationToken);

    private async Task EnsureAuthorRoleAsync(ApplicationUser user)
    {
        if (!await _roleManager.RoleExistsAsync(AuthorRole))
        {
            var roleResult = await _roleManager.CreateAsync(new IdentityRole(AuthorRole));
            if (!roleResult.Succeeded)
            {
                throw new DbUpdateException("Could not initialize the default user role.");
            }
        }

        var roleAssignment = await _userManager.AddToRoleAsync(user, AuthorRole);
        if (!roleAssignment.Succeeded)
        {
            throw new DbUpdateException("Could not assign the default role to the Google account.");
        }
    }

    private Task<int> RevokeActiveTokensAsync(string userId, DateTime now, CancellationToken cancellationToken)
    {
        return _dbContext.RefreshTokens
            .Where(token => token.UserId == userId && token.RevokedAt == null && token.ExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters.SetProperty(token => token.RevokedAt, now), cancellationToken);
    }

    private async Task<AuthResponseDto> CreateAuthResponseAsync(
        ApplicationUser user,
        CancellationToken cancellationToken,
        (string RawToken, string TokenHash)? suppliedToken = null)
    {
        if (_dbContext.Database.CurrentTransaction is not null)
            return await IssueTokensAsync(user.Id, cancellationToken, suppliedToken);

        return await _dbContext.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
            var response = await IssueTokensAsync(user.Id, cancellationToken, suppliedToken);
            await transaction.CommitAsync(cancellationToken);
            return response;
        });
    }

    private async Task<AuthResponseDto> IssueTokensAsync(
        string userId,
        CancellationToken cancellationToken,
        (string RawToken, string TokenHash)? suppliedToken = null)
    {
        var user = await LockUserAsync(userId, cancellationToken);
        if (user is null || !user.IsActive) throw new UnauthorizedAccessException("Tài khoản không khả dụng.");
        if (await _userManager.IsLockedOutAsync(user)) throw new LockedException();
        var roles = await _userManager.GetRolesAsync(user);
        var (accessToken, accessTokenExpiry) = _jwtService.GenerateAccessToken(user, roles);
        var (refreshToken, refreshTokenHash) = suppliedToken ?? _jwtService.GenerateRefreshToken();
        var refreshLifetimeDays = _configuration.GetValue("Jwt:RefreshTokenDurationInDays", 7);
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var refreshTokenExpiry = now.AddDays(refreshLifetimeDays);

        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = refreshTokenHash,
            CreatedAt = now,
            ExpiresAt = refreshTokenExpiry,
            CreatedByIp = _httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString()
        });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new AuthResponseDto(
            accessToken,
            refreshToken,
            accessTokenExpiry,
            refreshTokenExpiry,
            new UserDto(user.Id, user.Email!, user.DisplayName, user.AvatarUrl, user.Bio),
            roles.ToArray());
    }

    private async Task<AuthResponseDto> BuildAuthResponseAsync(
        ApplicationUser user,
        string refreshToken,
        DateTime refreshTokenExpiry)
    {
        var roles = await _userManager.GetRolesAsync(user);
        var (accessToken, accessTokenExpiry) = _jwtService.GenerateAccessToken(user, roles);
        return new AuthResponseDto(
            accessToken,
            refreshToken,
            accessTokenExpiry,
            refreshTokenExpiry,
            ToUserDto(user),
            roles.ToArray());
    }

    private async Task<T> ExecuteResilientAsync<T>(
        Func<AuthService, Task<T>> operation,
        CancellationToken cancellationToken)
    {
        var strategy = _dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var scope = _scopeFactory.CreateScope();
            var service = (AuthService)scope.ServiceProvider.GetRequiredService<IAuthService>();
            return await operation(service);
        });
    }
}
