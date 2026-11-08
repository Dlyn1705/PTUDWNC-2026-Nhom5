using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CulinaryBlog.Auth.Tests;

public sealed class CurrentUserProfileTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    [Fact]
    public async Task Me_returns_only_safe_profile_fields_and_can_patch_partial_fields()
    {
        var account = await RegisterAsync();
        using var get = await SendAsync(HttpMethod.Get, "/api/v1/auth/me", account.Access);
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        Assert.Equal("no-store", get.Headers.CacheControl?.ToString());
        var json = await get.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(json);
        var profile = document.RootElement.GetProperty("data");
        Assert.Equal(["avatarUrl", "bio", "createdAt", "displayName", "email", "id", "isActive", "roles"],
            profile.EnumerateObject().Select(property => property.Name).OrderBy(name => name, StringComparer.Ordinal));
        Assert.DoesNotContain("passwordHash", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("securityStamp", json, StringComparison.OrdinalIgnoreCase);

        using var patch = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/auth/me")
        {
            Content = JsonContent.Create(new { bio = "Updated bio", avatarUrl = "https://example.test/avatar.png" })
        };
        patch.Headers.Authorization = new AuthenticationHeaderValue("Bearer", account.Access);
        using var patched = await fixture.Client.SendAsync(patch);
        Assert.Equal(HttpStatusCode.OK, patched.StatusCode);
        var updated = (await patched.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data");
        Assert.Equal("Updated bio", updated.GetProperty("bio").GetString());
        Assert.Equal("https://example.test/avatar.png", updated.GetProperty("avatarUrl").GetString());
        Assert.Equal(account.DisplayName, updated.GetProperty("displayName").GetString());
    }

    [Fact]
    public async Task Me_rejects_invalid_patch_and_requires_authentication()
    {
        var unauthenticated = await fixture.Client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, unauthenticated.StatusCode);

        var account = await RegisterAsync();
        using var patch = new HttpRequestMessage(HttpMethod.Patch, "/api/v1/auth/me")
        {
            Content = JsonContent.Create(new { displayName = "x", avatarUrl = "javascript:alert(1)" })
        };
        patch.Headers.Authorization = new AuthenticationHeaderValue("Bearer", account.Access);
        using var response = await fixture.Client.SendAsync(patch);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Me_returns_expected_errors_for_disabled_and_deleted_accounts()
    {
        var disabled = await RegisterAsync();
        await fixture.WithDb(db => db.Users.Where(user => user.Id == disabled.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(user => user.IsActive, false)));
        using var disabledResponse = await SendAsync(HttpMethod.Get, "/api/v1/auth/me", disabled.Access);
        Assert.Equal(HttpStatusCode.Unauthorized, disabledResponse.StatusCode);

        var deleted = await RegisterAsync();
        await fixture.WithDb(db => db.Users.Where(user => user.Id == deleted.Id).ExecuteDeleteAsync());
        using var deletedResponse = await SendAsync(HttpMethod.Get, "/api/v1/auth/me", deleted.Access);
        Assert.Equal(HttpStatusCode.NotFound, deletedResponse.StatusCode);
    }

    private async Task<(string Id, string Access, string DisplayName)> RegisterAsync()
    {
        var email = $"profile-{Guid.NewGuid():N}@example.test";
        const string displayName = "Profile User";
        var response = await fixture.Client.PostAsJsonAsync("/api/v1/auth/register",
            new { email, displayName, password = "SecurePass123!", confirmPassword = "SecurePass123!" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var data = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data");
        return (data.GetProperty("user").GetProperty("id").GetString()!,
            data.GetProperty("accessToken").GetString()!, displayName);
    }

    private Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, string accessToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return fixture.Client.SendAsync(request);
    }
}
