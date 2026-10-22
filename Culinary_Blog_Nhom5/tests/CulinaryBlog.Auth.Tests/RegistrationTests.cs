using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CulinaryBlog.Auth.Tests;

public sealed class RegistrationTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    [Fact]
    public async Task RegistrationReturnsProfileAndLeavesNoUsableRefreshSession()
    {
        var email = $"{Guid.NewGuid():N}@example.test";
        using var response = await fixture.Client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            displayName = "New Author",
            password = "SecurePass123!",
            confirmPassword = "SecurePass123!"
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var profile = body.GetProperty("data");
        var userId = profile.GetProperty("id").GetString();
        Assert.Equal(email, profile.GetProperty("email").GetString());
        Assert.False(profile.TryGetProperty("accessToken", out _));
        Assert.False(profile.TryGetProperty("refreshToken", out _));

        Assert.Contains(
            response.Headers.GetValues("Set-Cookie"),
            cookie => cookie.Contains("expires=Thu, 01 Jan 1970", StringComparison.OrdinalIgnoreCase));

        var tokens = await fixture.WithDb(db => db.RefreshTokens
            .AsNoTracking()
            .Where(token => token.UserId == userId)
            .ToListAsync());
        Assert.NotEmpty(tokens);
        Assert.All(tokens, token => Assert.True(token.IsRevoked));
    }

    [Fact]
    public async Task AdminRoleCannotBeAssignedThroughAnHttpEndpoint()
    {
        using var response = await fixture.Client.PostAsJsonAsync(
            $"/api/v1/admin/users/{Guid.NewGuid():N}/roles",
            new { role = "Admin" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
