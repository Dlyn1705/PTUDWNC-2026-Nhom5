using System.Security.Claims;
using CulinaryBlog.API.Endpoints;
using Xunit;

namespace CulinaryBlog.Observability.Tests;

public sealed class AuthLogoutTests
{
    [Theory]
    [InlineData(ClaimTypes.Role, "Author", true)]
    [InlineData(ClaimTypes.Role, "Admin", true)]
    [InlineData("roles", "Author", true)]
    [InlineData("role", "Admin", true)]
    [InlineData(ClaimTypes.Role, "Guest", false)]
    [InlineData(ClaimTypes.Role, "", false)]
    public void Logout_requires_author_or_admin_role(string claimType, string role, bool expected)
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            new[] { new Claim(claimType, role) },
            authenticationType: "Bearer"));

        Assert.Equal(expected, LogoutAuthorization.HasRequiredRole(principal));
    }
}
