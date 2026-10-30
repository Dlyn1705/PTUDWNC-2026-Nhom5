using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
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
    private readonly IPasswordResetEmailSender _passwordResetEmailSender;

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
        IPasswordResetEmailSender passwordResetEmailSender)
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
        _passwordResetEmailSender = passwordResetEmailSender;
    }

    public async Task RequestPasswordResetAsync(string email, CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByEmailAsync(email.Trim());
        if (user is null || !user.IsActive || !await _userManager.HasPasswordAsync(user)) return;

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        // Limit mail to one message per account per minute as well as the endpoint's IP limiter.
        if (await _dbContext.PasswordResetTokens.AnyAsync(token => token.UserId == user.Id
            && token.CreatedAt > now.AddMinutes(-1), cancellationToken)) return;

        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        _dbContext.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = HashResetToken(rawToken),
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(30)
        });
        await _dbContext.SaveChangesAsync(cancellationToken);
        try
        {
            await _passwordResetEmailSender.SendAsync(user.Email!, rawToken, cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            // The public response must never reveal account or SMTP state.
            _logger.LogError(exception, "Password reset mail delivery failed for user {UserId}", user.Id);
        }
    }

    public Task ResetPasswordAsync(string email, string token, string newPassword, CancellationToken cancellationToken) =>
        _dbContext.Database.CreateExecutionStrategy().ExecuteAsync(
            () => ResetPasswordCoreAsync(email, token, newPassword, cancellationToken));

    private async Task ResetPasswordCoreAsync(string email, string token, string newPassword, CancellationToken cancellationToken)
    {
        if (token.Length > 256) throw new BadRequestException("Invalid or expired reset token.");
        var hash = HashResetToken(token);
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        var stored = await _dbContext.PasswordResetTokens.AsNoTracking()
            .SingleOrDefaultAsync(value => value.TokenHash == hash, cancellationToken);
        var user = stored is null ? null : await _userManager.FindByIdAsync(stored.UserId);
        if (user is null || !user.IsActive || !string.Equals(user.Email, email.Trim(), StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException("Invalid or expired reset token.");

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var claimed = await _dbContext.PasswordResetTokens
            .Where(value => value.Id == stored!.Id && value.ConsumedAt == null && value.ExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters.SetProperty(value => value.ConsumedAt, now), cancellationToken);
        if (claimed != 1) throw new BadRequestException("Invalid or expired reset token.");

        var identityToken = await _userManager.GeneratePasswordResetTokenAsync(user);
        var result = await _userManager.ResetPasswordAsync(user, identityToken, newPassword);
        if (!result.Succeeded) throw PasswordValidation(result);
        await _dbContext.PasswordResetTokens.Where(value => value.UserId == user.Id && value.ConsumedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(value => value.ConsumedAt, now), cancellationToken);
        await RevokeActiveTokensAsync(user.Id, now, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public Task ChangePasswordAsync(string userId, string currentPassword, string newPassword, CancellationToken cancellationToken) =>
        _dbContext.Database.CreateExecutionStrategy().ExecuteAsync(
            () => ChangePasswordCoreAsync(userId, currentPassword, newPassword, cancellationToken));

    private async Task ChangePasswordCoreAsync(string userId, string currentPassword, string newPassword, CancellationToken cancellationToken)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null || !user.IsActive) throw new UnauthorizedAccessException("Account unavailable.");
        var result = await _userManager.ChangePasswordAsync(user, currentPassword, newPassword);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(error => error.Code == "PasswordMismatch"))
                throw new ValidationException("CurrentPassword", "Current password is incorrect.");
            throw PasswordValidation(result);
        }
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        await RevokeActiveTokensAsync(userId, now, cancellationToken);
        await _dbContext.PasswordResetTokens.Where(value => value.UserId == userId && value.ConsumedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(value => value.ConsumedAt, now), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private static string HashResetToken(string token) =>
        Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static ValidationException PasswordValidation(IdentityResult result) => new(
        result.Errors.GroupBy(error => error.Code.StartsWith("Password", StringComparison.OrdinalIgnoreCase)
            ? "NewPassword" : "Password")
            .ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray()));

    public Task<AuthResponseDto> RegisterAsync(string email, string displayName, string password, CancellationToken cancellationToken)
    {
        var userId = Guid.NewGuid().ToString();
        var refreshToken = _jwtService.GenerateRefreshToken();
        return ExecuteResilientAsync(
            service => service.RegisterCoreAsync(email, displayName, password, userId, refreshToken, cancellationToken),
            cancellationToken);
    }

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
            new UserDto(user.Id, user.Email!, user.DisplayName),
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
            new UserDto(user.Id, user.Email!, user.DisplayName, user.AvatarUrl),
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
