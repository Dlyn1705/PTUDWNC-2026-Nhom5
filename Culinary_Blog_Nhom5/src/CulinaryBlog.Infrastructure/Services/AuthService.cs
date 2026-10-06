using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

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

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        RoleManager<IdentityRole> roleManager,
        ApplicationDbContext dbContext,
        IJwtService jwtService,
        IConfiguration configuration,
        IHttpContextAccessor httpContextAccessor,
        ILogger<AuthService> logger)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _roleManager = roleManager;
        _dbContext = dbContext;
        _jwtService = jwtService;
        _configuration = configuration;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
    }

    public async Task<AuthResponseDto> RegisterAsync(string email, string displayName, string password, CancellationToken cancellationToken)
    {
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

        var response = await CreateAuthResponseAsync(user, cancellationToken);
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

    public async Task<AuthResponseDto> RefreshAsync(string refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
        }

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

        var (newRefreshToken, newRefreshTokenHash) = _jwtService.GenerateRefreshToken();
        var updatedCount = await _dbContext.RefreshTokens
            .Where(token => token.Id == storedToken.Id
                && token.RevokedAt == null
                && token.ExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(token => token.RevokedAt, now)
                .SetProperty(token => token.ReplacedByTokenHash, newRefreshTokenHash), cancellationToken);

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
            TokenHash = newRefreshTokenHash,
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
            newRefreshToken,
            DateTime.UtcNow.AddSeconds(expiresInSeconds),
            refreshTokenExpiry,
            new UserDto(user.Id, user.Email!, user.DisplayName),
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

    private Task<int> RevokeActiveTokensAsync(string userId, DateTime now, CancellationToken cancellationToken)
    {
        return _dbContext.RefreshTokens
            .Where(token => token.UserId == userId && token.RevokedAt == null && token.ExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters.SetProperty(token => token.RevokedAt, now), cancellationToken);
    }

    private async Task<AuthResponseDto> CreateAuthResponseAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        var roles = await _userManager.GetRolesAsync(user);
        var (accessToken, expiresInSeconds) = _jwtService.GenerateAccessToken(user, roles);
        var (refreshToken, refreshTokenHash) = _jwtService.GenerateRefreshToken();
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

        return new AuthResponseDto(
            accessToken,
            refreshToken,
            DateTime.UtcNow.AddSeconds(expiresInSeconds),
            refreshTokenExpiry,
            new UserDto(user.Id, user.Email!, user.DisplayName),
            roles.ToArray());
    }
}
