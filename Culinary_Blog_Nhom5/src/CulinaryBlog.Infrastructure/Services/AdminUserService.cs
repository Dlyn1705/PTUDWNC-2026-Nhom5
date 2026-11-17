using System.Data;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Auth.Admin;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class AdminUserService(IServiceScopeFactory scopes) : IAdminUserService
{
    public async Task<PagedResult<AdminUserDto>> ListAsync(
        int page, int pageSize, string? role, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var query = db.Users.AsNoTracking();
        if (role is not null)
        {
            var memberIds = from membership in db.UserRoles.AsNoTracking()
                join identityRole in db.Roles.AsNoTracking() on membership.RoleId equals identityRole.Id
                where identityRole.Name == role
                select membership.UserId;
            query = query.Where(user => memberIds.Contains(user.Id));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var offset = ((long)page - 1) * pageSize;
        if (offset > int.MaxValue)
            return new PagedResult<AdminUserDto>([], totalCount, page, pageSize);

        var selectedUsers = await query.OrderByDescending(user => user.CreatedAt).ThenBy(user => user.Id)
            .Skip((int)offset).Take(pageSize)
            .Select(user => new { user.Id, user.Email, user.DisplayName, user.IsActive, user.CreatedAt })
            .ToArrayAsync(cancellationToken);
        var userIds = selectedUsers.Select(user => user.Id).ToArray();
        var roleRows = await (from membership in db.UserRoles.AsNoTracking()
            join identityRole in db.Roles.AsNoTracking() on membership.RoleId equals identityRole.Id
            where userIds.Contains(membership.UserId)
            select new { membership.UserId, identityRole.Name }).ToArrayAsync(cancellationToken);
        var data = selectedUsers.Select(user => new AdminUserDto(
            user.Id,
            user.Email ?? string.Empty,
            user.DisplayName,
            roleRows.Where(row => row.UserId == user.Id).Select(row => row.Name ?? string.Empty)
                .OrderBy(name => name, StringComparer.Ordinal).ToArray(),
            user.IsActive,
            user.CreatedAt)).ToArray();
        return new PagedResult<AdminUserDto>(data, totalCount, page, pageSize);
    }

    public async Task<AdminUserDto> SetExclusiveRoleAsync(
        string userId, string role, string? requesterId, CancellationToken cancellationToken)
    {
        using var strategyScope = scopes.CreateScope();
        var strategyDb = strategyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await strategyDb.Database.CreateExecutionStrategy().ExecuteAsync(
            () => ChangeRoleOnceAsync(userId, role, requesterId, cancellationToken));
    }

    private async Task<AdminUserDto> ChangeRoleOnceAsync(
        string userId, string selectedRole, string? requesterId, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);

        if (!await db.Roles.AsNoTracking().AnyAsync(role => role.Name == selectedRole, cancellationToken))
            throw new ConflictException("Vai trò được yêu cầu hiện không khả dụng.", "ADMIN_ROLE_UNAVAILABLE");

        var user = await db.Users.SingleOrDefaultAsync(user => user.Id == userId, cancellationToken)
            ?? throw new NotFoundException("User", userId);
        var currentRoles = await users.GetRolesAsync(user);
        if (currentRoles.Contains("Admin") && selectedRole != "Admin")
        {
            if (requesterId == user.Id)
                throw new ConflictException("Bạn không thể tự gỡ quyền Admin của mình.", "ADMIN_SELF_DEMOTION");

            var adminRoleId = await db.Roles.AsNoTracking()
                .Where(role => role.Name == "Admin").Select(role => role.Id)
                .SingleAsync(cancellationToken);
            var adminCount = await db.UserRoles.CountAsync(
                member => member.RoleId == adminRoleId, cancellationToken);
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
            .Where(current => current is "Admin" or "Author" && current != selectedRole).ToArray();
        if (obsoleteRoles.Length > 0)
        {
            var removed = await users.RemoveFromRolesAsync(user, obsoleteRoles);
            if (!removed.Succeeded)
                throw new ConflictException("Không thể cập nhật vai trò người dùng.", "ADMIN_ROLE_UPDATE_FAILED");
        }

        var roles = await users.GetRolesAsync(user);
        await transaction.CommitAsync(cancellationToken);
        return new AdminUserDto(
            user.Id,
            user.Email ?? string.Empty,
            user.DisplayName,
            roles.OrderBy(value => value, StringComparer.Ordinal).ToArray(),
            user.IsActive,
            user.CreatedAt);
    }
}
