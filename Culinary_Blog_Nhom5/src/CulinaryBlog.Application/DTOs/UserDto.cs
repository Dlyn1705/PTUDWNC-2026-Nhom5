namespace CulinaryBlog.Application.DTOs;

public sealed record UserDto(string Id, string Email, string DisplayName, string? AvatarUrl = null);
