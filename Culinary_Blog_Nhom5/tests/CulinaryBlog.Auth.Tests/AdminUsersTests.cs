using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace CulinaryBlog.Auth.Tests;

public sealed class AdminUsersTests : IAsyncLifetime
{
    private const string Password = "SecurePass123!";
    private readonly AuthFixture fixture = new();

    public Task InitializeAsync() => fixture.InitializeAsync();
    public Task DisposeAsync() => fixture.DisposeAsync();

    [Fact]
    public async Task List_filters_and_pages_users_without_identity_secrets()
    {
        var admin = await CreateUserAsync(admin: true);
        var firstAuthor = await CreateUserAsync(admin: false);
        var secondAuthor = await CreateUserAsync(admin: false);

        using var adminList = await SendAsAsync(admin, HttpMethod.Get, "/api/v1/admin/users?role=Admin&page=1&pageSize=50");
        Assert.Equal(HttpStatusCode.OK, adminList.StatusCode);
        var json = await adminList.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal(2, root.EnumerateObject().Count());
        var users = root.GetProperty("data");
        Assert.Equal(JsonValueKind.Array, users.ValueKind);
        Assert.Contains(users.EnumerateArray(), item => item.GetProperty("id").GetString() == admin.User.Id);
        Assert.DoesNotContain(users.EnumerateArray(), item => item.GetProperty("id").GetString() == firstAuthor.User.Id);
        var summary = users.EnumerateArray().First(item => item.GetProperty("id").GetString() == admin.User.Id);
        Assert.Equal(
            ["createdAt", "displayName", "email", "id", "isActive", "roles"],
            summary.EnumerateObject().Select(property => property.Name).OrderBy(name => name, StringComparer.Ordinal));
        Assert.True(summary.GetProperty("isActive").GetBoolean());
        Assert.NotEqual(default, summary.GetProperty("createdAt").GetDateTime());
        Assert.Contains(summary.GetProperty("roles").EnumerateArray(), role => role.GetString() == "Admin");
        foreach (var secret in new[] { "passwordHash", "securityStamp", "concurrencyStamp", "refreshToken", "lockoutEnd" })
            Assert.DoesNotContain(secret, json, StringComparison.OrdinalIgnoreCase);

        using var pageOne = await SendAsAsync(admin, HttpMethod.Get, "/api/v1/admin/users?role=Author&page=1&pageSize=1");
        using var pageTwo = await SendAsAsync(admin, HttpMethod.Get, "/api/v1/admin/users?role=Author&page=2&pageSize=1");
        Assert.Equal(HttpStatusCode.OK, pageOne.StatusCode);
        Assert.Equal(HttpStatusCode.OK, pageTwo.StatusCode);
        using var firstPage = JsonDocument.Parse(await pageOne.Content.ReadAsStringAsync());
        using var secondPage = JsonDocument.Parse(await pageTwo.Content.ReadAsStringAsync());
        var first = Assert.Single(firstPage.RootElement.GetProperty("data").EnumerateArray());
        var second = Assert.Single(secondPage.RootElement.GetProperty("data").EnumerateArray());
        Assert.NotEqual(first.GetProperty("id").GetString(), second.GetProperty("id").GetString());
        Assert.Equal(1, firstPage.RootElement.GetProperty("meta").GetProperty("page").GetInt32());
        Assert.Equal(2, secondPage.RootElement.GetProperty("meta").GetProperty("page").GetInt32());
        Assert.True(firstPage.RootElement.GetProperty("meta").GetProperty("totalCount").GetInt32() >= 2);

        using var authorList = await SendAsAsync(admin, HttpMethod.Get, "/api/v1/admin/users?role=Author&pageSize=50");
        using var authors = JsonDocument.Parse(await authorList.Content.ReadAsStringAsync());
        var authorRows = authors.RootElement.GetProperty("data").EnumerateArray().ToArray();
        Assert.Contains(authorRows, item => item.GetProperty("id").GetString() == firstAuthor.User.Id);
        Assert.Contains(authorRows, item => item.GetProperty("id").GetString() == secondAuthor.User.Id);
        Assert.DoesNotContain(authorRows, item => item.GetProperty("id").GetString() == admin.User.Id);
    }

    [Fact]
    public async Task Invalid_query_parameters_are_rejected()
    {
        var admin = await CreateUserAsync(admin: true);
        foreach (var query in new[] { "page=0", "pageSize=0", "pageSize=51", "role=Reader", "role=" })
        {
            using var response = await SendAsAsync(admin, HttpMethod.Get, "/api/v1/admin/users?" + query);
            Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        }
        using var malformed = await SendAsAsync(admin, HttpMethod.Get, "/api/v1/admin/users?page=abc");
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
    }

    [Fact]
    public async Task Guest_and_author_cannot_read_or_mutate_admin_users()
    {
        var author = await CreateUserAsync(admin: false);
        using var guestList = await fixture.Client.GetAsync("/api/v1/admin/users");
        using var authorList = await SendAsAsync(author, HttpMethod.Get, "/api/v1/admin/users");
        using var guestMutation = await fixture.Client.PostAsJsonAsync(
            $"/api/v1/admin/users/{author.User.Id}/roles", new { role = "Admin" });
        using var authorMutation = await SendAsAsync(author, HttpMethod.Post,
            $"/api/v1/admin/users/{author.User.Id}/roles", new { role = "Admin" });
        Assert.Equal(HttpStatusCode.Unauthorized, guestList.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, authorList.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, guestMutation.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, authorMutation.StatusCode);
    }

    [Fact]
    public async Task Role_change_blocks_self_and_last_admin_and_rolls_back_after_failure()
    {
        var firstAdmin = await CreateUserAsync(admin: true);
        var secondAdmin = await CreateUserAsync(admin: true);
        var target = await CreateUserAsync(admin: false);

        using var self = await SendAsAsync(firstAdmin, HttpMethod.Post,
            $"/api/v1/admin/users/{firstAdmin.User.Id}/roles", new { role = "Author" });
        await AssertConflictCodeAsync(self, "ADMIN_SELF_DEMOTION");

        using var promoted = await SendAsAsync(firstAdmin, HttpMethod.Post,
            $"/api/v1/admin/users/{target.User.Id}/roles", new { role = "Admin" });
        Assert.Equal(HttpStatusCode.OK, promoted.StatusCode);
        using (var body = JsonDocument.Parse(await promoted.Content.ReadAsStringAsync()))
        {
            var summary = body.RootElement.GetProperty("data");
            Assert.Equal(target.User.Id, summary.GetProperty("id").GetString());
            Assert.Equal("Admin", Assert.Single(summary.GetProperty("roles").EnumerateArray()).GetString());
        }
        using var demoted = await SendAsAsync(firstAdmin, HttpMethod.Post,
            $"/api/v1/admin/users/{target.User.Id}/roles", new { role = "Author" });
        Assert.Equal(HttpStatusCode.OK, demoted.StatusCode);

        fixture.Failures.FailNextRoleRemoval = true;
        using var failed = await SendAsAsync(firstAdmin, HttpMethod.Post,
            $"/api/v1/admin/users/{target.User.Id}/roles", new { role = "Admin" });
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
        Assert.False(fixture.Failures.FailNextRoleRemoval);
        Assert.Equal(["Author"], await ReadRolesAsync(target.User.Id));

        using var removeSecond = await SendAsAsync(firstAdmin, HttpMethod.Post,
            $"/api/v1/admin/users/{secondAdmin.User.Id}/roles", new { role = "Author" });
        Assert.Equal(HttpStatusCode.OK, removeSecond.StatusCode);
        // The second admin's JWT still has the old claim; the database guard must
        // nevertheless protect the final Admin membership.
        using var lastAdmin = await SendAsAsync(secondAdmin, HttpMethod.Post,
            $"/api/v1/admin/users/{firstAdmin.User.Id}/roles", new { role = "Author" });
        await AssertConflictCodeAsync(lastAdmin, "ADMIN_LAST_ADMIN");
        Assert.Equal(["Admin"], await ReadRolesAsync(firstAdmin.User.Id));
    }

    private async Task<AuthResponseDto> CreateUserAsync(bool admin)
    {
        using var scope = fixture.Services.CreateScope();
        var auth = scope.ServiceProvider.GetRequiredService<IAuthService>();
        var session = await auth.RegisterAsync(
            $"{Guid.NewGuid():N}@example.test", "Admin Contract User", Password, CancellationToken.None);
        if (!admin) return session;

        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        if (!await roles.RoleExistsAsync("Admin"))
            Assert.True((await roles.CreateAsync(new IdentityRole("Admin"))).Succeeded);
        var user = await users.FindByIdAsync(session.User.Id);
        Assert.NotNull(user);
        Assert.True((await users.AddToRoleAsync(user!, "Admin")).Succeeded);
        Assert.True((await users.RemoveFromRoleAsync(user!, "Author")).Succeeded);
        return await auth.LoginAsync(session.User.Email, Password, CancellationToken.None);
    }

    private async Task<string[]> ReadRolesAsync(string userId)
    {
        using var scope = fixture.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByIdAsync(userId);
        Assert.NotNull(user);
        return (await users.GetRolesAsync(user!)).OrderBy(role => role, StringComparer.Ordinal).ToArray();
    }

    private async Task<HttpResponseMessage> SendAsAsync(
        AuthResponseDto session, HttpMethod method, string path, object? body = null)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        if (body is not null) request.Content = JsonContent.Create(body);
        return await fixture.Client.SendAsync(request);
    }

    private static async Task AssertConflictCodeAsync(HttpResponseMessage response, string code)
    {
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(code, body.RootElement.GetProperty("code").GetString());
    }
}
