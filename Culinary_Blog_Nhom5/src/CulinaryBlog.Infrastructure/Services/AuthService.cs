using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class AuthService : IAuthService
{
    private const string AuthorRole = "Author";
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<IdentityRole> _roleManager;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole> roleManager)
    {
        _userManager = userManager;
        _roleManager = roleManager;
    }

    public async Task<UserDto> RegisterAsync(string email, string displayName, string password, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

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

        return new UserDto(user.Id, user.Email!, user.DisplayName);
    }
}
