using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace CulinaryBlog.Auth.Tests;

public sealed class ProfileTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    private async Task<AuthResponseDto> NewSession()
    {
        using var scope = fixture.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IAuthService>()
            .RegisterAsync($"{Guid.NewGuid():N}@example.test", "Profile Author", "SecurePass123!", default);
    }

    [Fact]
    public async Task ProfileEndpointsRequireAuthenticationAndReturnCurrentUserDetails()
    {
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await fixture.Client.GetAsync("/api/v1/auth/me")).StatusCode);

        var session = await NewSession();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        using var response = await fixture.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data");
        Assert.Equal(session.User.Id, body.GetProperty("id").GetString());
        Assert.Equal(session.User.Email, body.GetProperty("email").GetString());
        Assert.Equal("Profile Author", body.GetProperty("displayName").GetString());
        Assert.True(body.TryGetProperty("bio", out _));
    }

    [Fact]
    public async Task ProfilePatchUpdatesDisplayNameAndBio()
    {
        var session = await NewSession();
        using var request = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/auth/me")
        {
            Content = JsonContent.Create(new { displayName = "Updated Author", bio = "Loves baking." })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        using var response = await fixture.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data");
        Assert.Equal("Updated Author", body.GetProperty("displayName").GetString());
        Assert.Equal("Loves baking.", body.GetProperty("bio").GetString());
    }

    [Fact]
    public async Task PasswordChangeValidatesCurrentPasswordAndRevokesExistingRefreshTokens()
    {
        var session = await NewSession();
        using var wrongPassword = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/auth/me/password")
        {
            Content = JsonContent.Create(new { currentPassword = "WrongPass123!", newPassword = "AnotherPass456!" })
        };
        wrongPassword.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        using var rejected = await fixture.Client.SendAsync(wrongPassword);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, rejected.StatusCode);

        using var changePassword = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/auth/me/password")
        {
            Content = JsonContent.Create(new { currentPassword = "SecurePass123!", newPassword = "AnotherPass456!" })
        };
        changePassword.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        using var changed = await fixture.Client.SendAsync(changePassword);
        Assert.Equal(HttpStatusCode.NoContent, changed.StatusCode);

        using var login = await fixture.Client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = session.User.Email,
            password = "AnotherPass456!"
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        using var refresh = await fixture.Client.PostAsJsonAsync("/api/v1/auth/refresh", new
        {
            refreshToken = session.RefreshToken
        });
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }
}
