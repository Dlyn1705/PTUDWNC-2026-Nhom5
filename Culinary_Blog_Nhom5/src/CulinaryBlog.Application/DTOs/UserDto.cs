namespace CulinaryBlog.Application.DTOs;

public sealed record UserDto(string Id, string Email, string DisplayName, string? AvatarUrl = null);

/// <summary>Safe representation returned by the current-user profile contract.</summary>
public sealed record CurrentUserDto(
    string Id,
    string Email,
    string DisplayName,
    string? AvatarUrl,
    string? Bio,
    IReadOnlyList<string> Roles,
    bool IsActive,
    DateTime CreatedAt);

public sealed record UpdateProfileDto(string? DisplayName, string? Bio, string? AvatarUrl);
