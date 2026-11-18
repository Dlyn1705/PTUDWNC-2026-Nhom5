using System.Text.Json.Serialization;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Exceptions;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Admin;

public sealed record AdminUserDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("email")] string Email,
    [property: JsonPropertyName("displayName")] string DisplayName,
    [property: JsonPropertyName("roles")] IReadOnlyList<string> Roles,
    [property: JsonPropertyName("isActive")] bool IsActive,
    [property: JsonPropertyName("createdAt")] DateTime CreatedAt);

public sealed record ListAdminUsersQuery(
    int Page = 1, int PageSize = 20, string? Role = null)
    : IRequest<PagedResult<AdminUserDto>>;

public sealed class ListAdminUsersQueryHandler(
    IAdminUserService users,
    ICurrentUserService currentUser)
    : IRequestHandler<ListAdminUsersQuery, PagedResult<AdminUserDto>>
{
    public Task<PagedResult<AdminUserDto>> Handle(
        ListAdminUsersQuery request, CancellationToken cancellationToken)
    {
        EnsureAdministrator(currentUser);
        if (request.Page < 1)
            throw new ValidationException("page", "page phải lớn hơn hoặc bằng 1.");
        if (request.PageSize is < 1 or > 50)
            throw new ValidationException("pageSize", "pageSize phải nằm trong khoảng 1 đến 50.");
        var role = request.Role?.Trim();
        if (request.Role is not null && role is not ("Admin" or "Author"))
            throw new ValidationException("role", "role phải là Admin hoặc Author.");
        return users.ListAsync(request.Page, request.PageSize, role, cancellationToken);
    }

    internal static void EnsureAdministrator(ICurrentUserService currentUser)
    {
        if (!currentUser.IsAuthenticated || string.IsNullOrWhiteSpace(currentUser.UserId))
            throw new UnauthorizedAccessException("Authentication required.");
        if (!currentUser.IsAdmin)
            throw new ForbiddenException("Administrator role required.");
    }
}

public sealed record SetAdminUserRoleCommand(
    string UserId, string Role) : IRequest<AdminUserDto>;

public sealed class SetAdminUserRoleCommandHandler(
    IAdminUserService users,
    ICurrentUserService currentUser)
    : IRequestHandler<SetAdminUserRoleCommand, AdminUserDto>
{
    public Task<AdminUserDto> Handle(
        SetAdminUserRoleCommand request, CancellationToken cancellationToken)
    {
        ListAdminUsersQueryHandler.EnsureAdministrator(currentUser);
        var role = request.Role?.Trim();
        if (role is not ("Admin" or "Author"))
            throw new ValidationException("role", "role phải là Admin hoặc Author.");
        return users.SetExclusiveRoleAsync(
            request.UserId, role, currentUser.UserId, cancellationToken);
    }
}
