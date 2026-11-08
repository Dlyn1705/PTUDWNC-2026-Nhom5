using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CulinaryBlog.Auth.Tests;

public sealed class PasswordResetTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    private async Task<(string Email, string Access, string Refresh)> Register()
    {
        var email = $"reset-{Guid.NewGuid():N}@example.test";
        var response = await fixture.Client.PostAsJsonAsync("/api/v1/auth/register",
            new { email, displayName = "Reset User", password = "SecurePass123!", confirmPassword = "SecurePass123!" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data");
        Assert.Contains(body.GetProperty("roles").EnumerateArray(), role => role.GetString() == "Author");
        var cookie = response.Headers.GetValues("Set-Cookie").Single(value => value.StartsWith("culinary_refresh_token="));
        return (email, body.GetProperty("accessToken").GetString()!, cookie.Split(';')[0]["culinary_refresh_token=".Length..]);
    }

    [Fact]
    public async Task ForgotIsNonDisclosingAndResetConsumesHashedTokenAndRevokesSession()
    {
        var account = await Register();
        var unknown = await fixture.Client.PostAsJsonAsync("/api/v1/auth/forgot-password",
            new { email = $"unknown-{Guid.NewGuid():N}@example.test" });
        var known = await fixture.Client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = account.Email });
        Assert.Equal(HttpStatusCode.Accepted, unknown.StatusCode);
        Assert.Equal(unknown.StatusCode, known.StatusCode);
        Assert.Equal(await unknown.Content.ReadAsStringAsync(), await known.Content.ReadAsStringAsync());
        var token = Assert.IsType<string>(fixture.ResetEmail.LastToken);
        Assert.Equal(account.Email, fixture.ResetEmail.LastEmail);
        var rows = await fixture.WithDb(db => db.PasswordResetTokens.AsNoTracking().ToListAsync());
        Assert.Single(rows);
        Assert.DoesNotContain(token, rows[0].TokenHash);
        Assert.Equal(64, rows[0].TokenHash.Length);

        var reset = await fixture.Client.PostAsJsonAsync("/api/v1/auth/reset-password",
            new { email = account.Email, token, newPassword = "ChangedPass123!" });
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await fixture.Client.PostAsJsonAsync("/api/v1/auth/reset-password",
            new { email = account.Email, token, newPassword = "AnotherPass123!" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fixture.Client.PostAsJsonAsync("/api/v1/auth/refresh",
            new { refreshToken = account.Refresh })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fixture.Client.PostAsJsonAsync("/api/v1/auth/login",
            new { email = account.Email, password = "SecurePass123!" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await fixture.Client.PostAsJsonAsync("/api/v1/auth/login",
            new { email = account.Email, password = "ChangedPass123!" })).StatusCode);
    }

    [Fact]
    public async Task ExpiredTokenCannotResetPassword()
    {
        var account = await Register();
        await fixture.Client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = account.Email });
        var token = fixture.ResetEmail.LastToken!;
        await fixture.WithDb(db => db.PasswordResetTokens.ExecuteUpdateAsync(update =>
            update.SetProperty(row => row.ExpiresAt, DateTime.UtcNow.AddMinutes(-1))));
        Assert.Equal(HttpStatusCode.BadRequest, (await fixture.Client.PostAsJsonAsync("/api/v1/auth/reset-password",
            new { email = account.Email, token, newPassword = "ChangedPass123!" })).StatusCode);
    }

    [Fact]
    public async Task ChangePasswordRequiresBearerAndRevokesRefreshCookie()
    {
        var account = await Register();
        Assert.Equal(HttpStatusCode.Unauthorized, (await fixture.Client.PostAsJsonAsync("/api/v1/auth/change-password",
            new { currentPassword = "SecurePass123!", newPassword = "ChangedPass123!" })).StatusCode);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/change-password")
        {
            Content = JsonContent.Create(new { currentPassword = "SecurePass123!", newPassword = "ChangedPass123!" })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", account.Access);
        var response = await fixture.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.StartsWith("culinary_refresh_token=;", response.Headers.GetValues("Set-Cookie").Single());
        Assert.Equal(HttpStatusCode.Unauthorized, (await fixture.Client.PostAsJsonAsync("/api/v1/auth/refresh",
            new { refreshToken = account.Refresh })).StatusCode);
    }
}
