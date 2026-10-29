using System.Data;
using System.Security.Claims;
using System.Text.Json.Serialization;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CulinaryBlog.API.Endpoints;

public sealed record SetUserRoleRequest(string Role);

// Only these six fields may cross the Admin API boundary.
public sealed record AdminUserDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("email")] string Email,
    [property: JsonPropertyName("displayName")] string DisplayName,
    [property: JsonPropertyName("roles")] IReadOnlyList<string> Roles,
    [property: JsonPropertyName("isActive")] bool IsActive,
    [property: JsonPropertyName("createdAt")] DateTime CreatedAt);

public sealed record AdminUserResponse([property: JsonPropertyName("data")] AdminUserDto Data);

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/admin/users")
            .WithTags("Admin")
            .RequireAuthorization("AdminOnly");

        group.MapGet("/", async Task<IResult> (
            int? page,
            int? pageSize,
            string? role,
            ApplicationDbContext db,
            CancellationToken ct) =>
        {
            var currentPage = page ?? 1;
            var currentSize = pageSize ?? 20;
            if (currentPage < 1)
                throw new ValidationException("page", "page phải lớn hơn hoặc bằng 1.");
            if (currentSize is < 1 or > 50)
                throw new ValidationException("pageSize", "pageSize phải nằm trong khoảng 1 đến 50.");
            var selectedRole = role?.Trim();
            if (role is not null && selectedRole is not ("Admin" or "Author"))
                throw new ValidationException("role", "role phải là Admin hoặc Author.");

            var query = db.Users.AsNoTracking();
            if (selectedRole is not null)
            {
                var memberIds = from membership in db.UserRoles.AsNoTracking()
                    join identityRole in db.Roles.AsNoTracking() on membership.RoleId equals identityRole.Id
                    where identityRole.Name == selectedRole
                    select membership.UserId;
                query = query.Where(user => memberIds.Contains(user.Id));
            }

            var totalCount = await query.CountAsync(ct);
            var offset = ((long)currentPage - 1) * currentSize;
            if (offset > int.MaxValue)
                return Results.Ok(new PagedResult<AdminUserDto>([], totalCount, currentPage, currentSize));

            var users = await query.OrderByDescending(user => user.CreatedAt).ThenBy(user => user.Id)
                .Skip((int)offset).Take(currentSize)
                .Select(user => new { user.Id, user.Email, user.DisplayName, user.IsActive, user.CreatedAt })
                .ToArrayAsync(ct);
            var userIds = users.Select(user => user.Id).ToArray();
            var roleRows = await (from membership in db.UserRoles.AsNoTracking()
                join identityRole in db.Roles.AsNoTracking() on membership.RoleId equals identityRole.Id
                where userIds.Contains(membership.UserId)
                select new { membership.UserId, identityRole.Name }).ToArrayAsync(ct);
            var data = users.Select(user => new AdminUserDto(
                user.Id,
                user.Email ?? string.Empty,
                user.DisplayName,
                roleRows.Where(row => row.UserId == user.Id).Select(row => row.Name ?? string.Empty)
                    .OrderBy(name => name, StringComparer.Ordinal).ToArray(),
                user.IsActive,
                user.CreatedAt)).ToArray();
            return Results.Ok(new PagedResult<AdminUserDto>(data, totalCount, currentPage, currentSize));
        })
        .WithName("AdminListUsers")
        .WithSummary("Danh sách tài khoản Admin/Author với phân trang và lọc role")
        .WithDescription("Query: page mặc định 1; pageSize mặc định 20, tối đa 50; role chỉ nhận Admin hoặc Author. Sắp xếp createdAt giảm dần, id tăng dần.")
        .Produces<PagedResult<AdminUserDto>>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        group.MapPost("/{userId}/roles", async Task<IResult> (
            string userId,
            SetUserRoleRequest request,
            IServiceScopeFactory scopes,
            HttpContext context,
            CancellationToken ct) =>
        {
            var selectedRole = request.Role?.Trim();
            if (selectedRole is not ("Admin" or "Author"))
                throw new ValidationException("role", "role phải là Admin hoặc Author.");

            using var strategyScope = scopes.CreateScope();
            var strategyDb = strategyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var requesterId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var changed = await strategyDb.Database.CreateExecutionStrategy().ExecuteAsync(
                () => ChangeRoleOnceAsync(scopes, userId, selectedRole, requesterId, ct));
            return Results.Ok(new AdminUserResponse(changed));
        })
        .WithName("AdminSetUserRole")
        .WithSummary("Đặt role Admin hoặc Author cho tài khoản")
        .Produces<AdminUserResponse>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        return app;
    }

    private static async Task<AdminUserDto> ChangeRoleOnceAsync(
        IServiceScopeFactory scopes,
        string userId,
        string selectedRole,
        string? requesterId,
        CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);

        if (!await db.Roles.AsNoTracking().AnyAsync(role => role.Name == selectedRole, ct))
            throw new ConflictException("Vai trò được yêu cầu hiện không khả dụng.", "ADMIN_ROLE_UNAVAILABLE");

        var user = await db.Users.SingleOrDefaultAsync(user => user.Id == userId, ct)
            ?? throw new NotFoundException("User", userId);
        var currentRoles = await users.GetRolesAsync(user);
        if (currentRoles.Contains("Admin") && selectedRole != "Admin")
        {
            if (requesterId == user.Id)
                throw new ConflictException("Bạn không thể tự gỡ quyền Admin của mình.", "ADMIN_SELF_DEMOTION");

            var adminRoleId = await db.Roles.AsNoTracking()
                .Where(role => role.Name == "Admin").Select(role => role.Id).SingleAsync(ct);
            var adminCount = await db.UserRoles.CountAsync(member => member.RoleId == adminRoleId, ct);
            if (adminCount <= 1)
                throw new ConflictException("Không thể gỡ quyền Admin cuối cùng.", "ADMIN_LAST_ADMIN");
        }

        if (!currentRoles.Contains(selectedRole))
        {
            var added = await users.AddToRoleAsync(user, selectedRole);
            if (!added.Succeeded)
                throw new ConflictException("Không thể cập nhật vai trò người dùng.", "ADMIN_ROLE_UPDATE_FAILED");
        }

        var obsoleteRoles = currentRoles
            .Where(role => role is "Admin" or "Author" && role != selectedRole).ToArray();
        if (obsoleteRoles.Length > 0)
        {
            var removed = await users.RemoveFromRolesAsync(user, obsoleteRoles);
            if (!removed.Succeeded)
                throw new ConflictException("Không thể cập nhật vai trò người dùng.", "ADMIN_ROLE_UPDATE_FAILED");
        }

        var result = await ToDtoAsync(user, users);
        await transaction.CommitAsync(ct);
        return result;
    }

    private static async Task<AdminUserDto> ToDtoAsync(
        ApplicationUser user,
        UserManager<ApplicationUser> users)
    {
        var roles = await users.GetRolesAsync(user);
        return new AdminUserDto(
            user.Id,
            user.Email ?? string.Empty,
            user.DisplayName,
            roles.OrderBy(role => role, StringComparer.Ordinal).ToArray(),
            user.IsActive,
            user.CreatedAt);
    }
}
