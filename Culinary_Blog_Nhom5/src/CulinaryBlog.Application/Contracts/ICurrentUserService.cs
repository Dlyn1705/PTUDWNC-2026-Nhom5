using System.Collections.Generic;

namespace CulinaryBlog.Application.Contracts;

public interface ICurrentUserService
{
    string? UserId { get; }
    string? Email { get; }
    IReadOnlyList<string> Roles { get; }
    bool IsAuthenticated { get; }
    bool IsAdmin { get; }
}
