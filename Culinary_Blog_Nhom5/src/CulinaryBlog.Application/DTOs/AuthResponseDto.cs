using System;
using System.Collections.Generic;

namespace CulinaryBlog.Application.DTOs;

public sealed record AuthResponseDto(
    string AccessToken,
    string RefreshToken,
    DateTime AccessTokenExpiry,
    DateTime RefreshTokenExpiry,
    UserDto User,
    IReadOnlyList<string> Roles);

public sealed record ChangePasswordDto(string CurrentPassword, string NewPassword);
