using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

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

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        RoleManager<IdentityRole> roleManager,
        ApplicationDbContext dbContext,
        IJwtService jwtService,
        IConfiguration configuration)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _roleManager = roleManager;
        _dbContext = dbContext;
        _jwtService = jwtService;
        _configuration = configuration;
    }

    public async Task<AuthResponseDto> RegisterAsync(string email, string displayName, string password, CancellationToken cancellationToken)
    {
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

        return await CreateAuthResponseAsync(user, cancellationToken);
    }

    public async Task<AuthResponseDto> LoginAsync(string email, string password, CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByEmailAsync(email.Trim());
        if (user is null)
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

        return await CreateAuthResponseAsync(user, cancellationToken);
    }

    private async Task<AuthResponseDto> CreateAuthResponseAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        var roles = await _userManager.GetRolesAsync(user);
        var (accessToken, expiresInSeconds) = _jwtService.GenerateAccessToken(user, roles);
        var (refreshToken, refreshTokenHash) = _jwtService.GenerateRefreshToken();
        var refreshLifetimeDays = _configuration.GetValue("Jwt:RefreshTokenDurationInDays", 7);

        _dbContext.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = refreshTokenHash,
            ExpiresAt = DateTime.UtcNow.AddDays(refreshLifetimeDays)
        });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new AuthResponseDto(
            accessToken,
            refreshToken,
            DateTime.UtcNow.AddSeconds(expiresInSeconds),
            new UserDto(user.Id, user.Email!, user.DisplayName));
    }
}