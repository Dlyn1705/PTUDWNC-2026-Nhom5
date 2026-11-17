using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Features.Auth.Admin;

namespace CulinaryBlog.Application.Contracts;

public interface IAdminUserService
{
    Task<PagedResult<AdminUserDto>> ListAsync(
        int page, int pageSize, string? role, CancellationToken cancellationToken);
    Task<AdminUserDto> SetExclusiveRoleAsync(
        string userId, string role, string? requesterId, CancellationToken cancellationToken);
}
