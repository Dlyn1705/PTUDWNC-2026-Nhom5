using System.Security.Claims;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Entities;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.API.Endpoints;

public sealed record SetUserRoleRequest(string Role);
public sealed record AdminUserSummaryDto(string Id, string Email, string DisplayName, IReadOnlyList<string> Roles);

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/admin/users")
            .WithTags("Admin")
            .RequireAuthorization("AdminOnly");

        group.MapGet("/", async (UserManager<ApplicationUser> userManager, CancellationToken cancellationToken) =>
        {
            var users = await userManager.Users
                .OrderBy(user => user.Email)
                .ToListAsync(cancellationToken);
            var results = new List<AdminUserSummaryDto>(users.Count);
            foreach (var user in users)
            {
                results.Add(await ToSummaryAsync(user, userManager));
            }

            return Results.Ok(ApiResponse<IReadOnlyList<AdminUserSummaryDto>>.Ok(results));
        })
        .WithName("AdminListUsers")
        .WithSummary("Liệt kê tài khoản và vai trò (Admin)")
        .Produces<ApiResponse<IReadOnlyList<AdminUserSummaryDto>>>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapPost("/{userId}/roles", async Task<IResult> (
            string userId,
            SetUserRoleRequest request,
            UserManager<ApplicationUser> userManager,
            RoleManager<IdentityRole> roleManager,
            HttpContext httpContext) =>
        {
            var role = request.Role?.Trim();
            if (role is not ("Admin" or "Author"))
            {
                throw new ValidationException("role", "Role must be Admin or Author.");
            }

            if (!await roleManager.RoleExistsAsync(role))
            {
                throw new ConflictException("Vai trò được yêu cầu hiện không khả dụng.", "ADMIN_ROLE_UNAVAILABLE");
            }

            var user = await userManager.FindByIdAsync(userId);
            if (user is null)
            {
                throw new NotFoundException("User", userId);
            }

            var currentRoles = await userManager.GetRolesAsync(user);
            if (currentRoles.Contains("Admin") && role != "Admin")
            {
                if (httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value == user.Id)
                {
                    throw new ConflictException("Bạn không thể tự gỡ quyền Admin của mình.", "ADMIN_SELF_DEMOTION");
                }

                var adminCount = await userManager.GetUsersInRoleAsync("Admin");
                if (adminCount.Count <= 1)
                {
                    throw new ConflictException("Không thể gỡ quyền Admin cuối cùng.", "ADMIN_LAST_ADMIN");
                }
            }

            if (!currentRoles.Contains(role))
            {
                var addResult = await userManager.AddToRoleAsync(user, role);
                if (!addResult.Succeeded)
                {
                    throw new ConflictException("Không thể cập nhật vai trò người dùng.", "ADMIN_ROLE_UPDATE_FAILED");
                }
            }

            var removeRoles = currentRoles.Where(existingRole => existingRole != role).ToArray();
            if (removeRoles.Length > 0)
            {
                var removeResult = await userManager.RemoveFromRolesAsync(user, removeRoles);
                if (!removeResult.Succeeded)
                {
                    throw new ConflictException("Không thể cập nhật vai trò người dùng.", "ADMIN_ROLE_UPDATE_FAILED");
                }
            }

            return Results.Ok(ApiResponse<AdminUserSummaryDto>.Ok(
                await ToSummaryAsync(user, userManager)));
        })
        .WithName("AdminSetUserRole")
        .WithSummary("Đặt vai trò tài khoản thành Admin hoặc Author (Admin)")
        .Produces<ApiResponse<AdminUserSummaryDto>>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        return app;
    }

    private static async Task<AdminUserSummaryDto> ToSummaryAsync(
        ApplicationUser user,
        UserManager<ApplicationUser> userManager)
    {
        var roles = await userManager.GetRolesAsync(user);
        return new AdminUserSummaryDto(user.Id, user.Email ?? string.Empty, user.DisplayName, roles.ToArray());
    }
}
