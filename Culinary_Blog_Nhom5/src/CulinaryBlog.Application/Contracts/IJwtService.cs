using System.Collections.Generic;
using CulinaryBlog.Domain.Entities;

namespace CulinaryBlog.Application.Contracts;

public interface IJwtService
{
    (string Token, int ExpiresInSeconds) GenerateAccessToken(ApplicationUser user, IList<string> roles);
    (string RawToken, string TokenHash) GenerateRefreshToken();
    string HashToken(string token);
}
