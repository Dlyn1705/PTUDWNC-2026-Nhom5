using System;
using System.Linq;
using System.Net.Http;
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
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class AuthService : IAuthService
{
    private const string AuthorRole = "Author";
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly RoleManager<IdentityRole> _roleManager;
    private readonly ApplicationDbContext _dbContext;
    private readonly IJwtService _jwtService;
    private readonly IConfiguration _configuration;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuthService> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        RoleManager<IdentityRole> roleManager,
        ApplicationDbContext dbContext,
        IJwtService jwtService,
        IConfiguration configuration,
        IHttpContextAccessor httpContextAccessor,
        ILogger<AuthService> logger,
        IServiceScopeFactory scopeFactory)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _roleManager = roleManager;
        _dbContext = dbContext;
        _jwtService = jwtService;
        _configuration = configuration;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    public Task<AuthResponseDto> RegisterAsync(string email, string displayName, string password, CancellationToken cancellationToken)
    {
        // Stable IDs/tokens let a retry recognize an already committed registration.
        var userId = Guid.NewGuid().ToString();
        var refreshToken = _jwtService.GenerateRefreshToken();
        return ExecuteResilientAsync(
            service => service.RegisterCoreAsync(email, displayName, password, userId, refreshToken, cancellationToken),
            cancellationToken);
    }

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
        {
            throw new ConflictException("Email đã được sử dụng.", "AUTH_EMAIL_EXISTS");
        }

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
        var response = await CreateAuthResponseAsync(user, cancellationToken, refreshToken);
        await transaction.CommitAsync(cancellationToken);
        _logger.LogInformation(
            "Audit auth registration succeeded for user {UserId} at {OccurredAtUtc}",
            user.Id,
            DateTimeOffset.UtcNow);
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

        var refreshToken = _jwtService.GenerateRefreshToken();
        return await ExecuteResilientAsync(
            service => service.GoogleLoginCoreAsync(loginProvider, payload.Subject, email, displayName, avatarUrl, refreshToken, cancellationToken),
            cancellationToken);
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
                new UserLoginInfo(loginProvider, subject, loginProvider));
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

        var response = await CreateAuthResponseAsync(user, cancellationToken, refreshToken);
        await transaction.CommitAsync(cancellationToken);
        _logger.LogInformation(
            "Audit Google sign-in succeeded for user {UserId} at {OccurredAtUtc}",
            user.Id,
            DateTimeOffset.UtcNow);
        return response;
    }

    public async Task<AuthResponseDto> RefreshAsync(string refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
        }

        var nextToken = _jwtService.GenerateRefreshToken();
        return await ExecuteResilientAsync(
            service => service.RefreshCoreAsync(refreshToken, nextToken, cancellationToken),
            cancellationToken);
    }

    private async Task<AuthResponseDto> RefreshCoreAsync(
        string refreshToken, (string RawToken, string TokenHash) nextToken, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var tokenHash = _jwtService.HashToken(refreshToken);
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        var storedToken = await _dbContext.RefreshTokens
            .SingleOrDefaultAsync(token => token.TokenHash == tokenHash, cancellationToken);

        if (storedToken is null)
        {
            throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
        }

        if (storedToken.IsRevoked)
        {
            // The previous attempt may have committed before its connection failed.
            if (storedToken.ReplacedByTokenHash == nextToken.TokenHash)
            {
                var committedToken = await _dbContext.RefreshTokens.AsNoTracking()
                    .SingleOrDefaultAsync(token => token.TokenHash == nextToken.TokenHash, cancellationToken);
                var committedUser = await _userManager.FindByIdAsync(storedToken.UserId);
                if (committedToken is not null && committedUser is not null)
                    return await BuildAuthResponseAsync(committedUser, nextToken.RawToken, committedToken.ExpiresAt);
            }
            await RevokeActiveTokensAsync(storedToken.UserId, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            _logger.LogWarning(
                "Refresh token reuse detected for user {UserId} at {OccurredAtUtc}",
                storedToken.UserId,
                DateTimeOffset.UtcNow);
            throw new UnauthorizedAccessException("Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.");
        }

        if (storedToken.ExpiresAt <= now)
        {
            throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
        }

        var user = await _userManager.FindByIdAsync(storedToken.UserId);
        if (user is null || !user.IsActive)
        {
            await RevokeActiveTokensAsync(storedToken.UserId, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            throw new UnauthorizedAccessException("Tài khoản không khả dụng.");
        }

        var updatedCount = await _dbContext.RefreshTokens
            .Where(token => token.Id == storedToken.Id
                && token.RevokedAt == null
                && token.ExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(token => token.RevokedAt, now)
                .SetProperty(token => token.ReplacedByTokenHash, nextToken.TokenHash), cancellationToken);

        if (updatedCount != 1)
        {
            await RevokeActiveTokensAsync(storedToken.UserId, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            _logger.LogWarning(
                "Concurrent refresh token reuse detected for user {UserId} at {OccurredAtUtc}",
                storedToken.UserId,
                DateTimeOffset.UtcNow);
            throw new UnauthorizedAccessException("Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.");
        }

        var refreshLifetimeDays = _configuration.GetValue("Jwt:RefreshTokenDurationInDays", 7);
        var refreshTokenExpiry = now.AddDays(refreshLifetimeDays);
        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = nextToken.TokenHash,
            ExpiresAt = refreshTokenExpiry,
            CreatedByIp = _httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString()
        });
        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var roles = await _userManager.GetRolesAsync(user);
        var (accessToken, expiresInSeconds) = _jwtService.GenerateAccessToken(user, roles);
        _logger.LogInformation(
            "Audit auth refresh succeeded for user {UserId} at {OccurredAtUtc}",
            user.Id,
            DateTimeOffset.UtcNow);

        return new AuthResponseDto(
            accessToken,
            nextToken.RawToken,
            DateTime.UtcNow.AddSeconds(expiresInSeconds),
            refreshTokenExpiry,
            new UserDto(user.Id, user.Email!, user.DisplayName, user.AvatarUrl),
            roles.ToArray());
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return;
        }

        var tokenHash = _jwtService.HashToken(refreshToken);
        var storedToken = await _dbContext.RefreshTokens
            .SingleOrDefaultAsync(token => token.TokenHash == tokenHash, cancellationToken);

        if (storedToken is null || storedToken.IsRevoked)
        {
            return;
        }

        storedToken.Revoke();
        await _dbContext.SaveChangesAsync(cancellationToken);
        _logger.LogInformation(
            "Audit auth logout succeeded for user {UserId} at {OccurredAtUtc}",
            storedToken.UserId,
            DateTimeOffset.UtcNow);
    }

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

    private async Task<T> ExecuteResilientAsync<T>(Func<AuthService, Task<T>> operation, CancellationToken cancellationToken)
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

    private async Task<AuthResponseDto> CreateAuthResponseAsync(
        ApplicationUser user, CancellationToken cancellationToken,
        (string RawToken, string TokenHash)? suppliedToken = null)
    {
        var (refreshToken, refreshTokenHash) = suppliedToken ?? _jwtService.GenerateRefreshToken();
        var refreshLifetimeDays = _configuration.GetValue("Jwt:RefreshTokenDurationInDays", 7);
        var refreshTokenExpiry = DateTime.UtcNow.AddDays(refreshLifetimeDays);

        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = refreshTokenHash,
            ExpiresAt = refreshTokenExpiry,
            CreatedByIp = _httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString()
        });
        await _dbContext.SaveChangesAsync(cancellationToken);
        return await BuildAuthResponseAsync(user, refreshToken, refreshTokenExpiry);
    }

    private async Task<AuthResponseDto> BuildAuthResponseAsync(ApplicationUser user, string refreshToken, DateTime refreshTokenExpiry)
    {
        var roles = await _userManager.GetRolesAsync(user);
        var (accessToken, expiresInSeconds) = _jwtService.GenerateAccessToken(user, roles);
        return new AuthResponseDto(
            accessToken,
            refreshToken,
            DateTime.UtcNow.AddSeconds(expiresInSeconds),
            refreshTokenExpiry,
            new UserDto(user.Id, user.Email!, user.DisplayName, user.AvatarUrl),
            roles.ToArray());
    }
}
