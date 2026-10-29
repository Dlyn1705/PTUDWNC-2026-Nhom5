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

public sealed class AdminEndpointContractTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    private const string Password = "SecurePass123!";

    [Fact]
    public async Task List_and_role_change_use_the_standard_data_envelope()
    {
        var admin = await CreateSessionAsync(isAdmin: true);
        var target = await CreateSessionAsync(isAdmin: false);

        using var list = await SendAsAsync(admin, HttpMethod.Get, "/api/v1/admin/users");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using (var document = JsonDocument.Parse(await list.Content.ReadAsStringAsync()))
        {
            var root = document.RootElement;
            Assert.True(root.TryGetProperty("data", out var users));
            Assert.Equal(JsonValueKind.Array, users.ValueKind);
            Assert.Contains(users.EnumerateArray(), user => user.GetProperty("id").GetString() == target.User.Id);
            Assert.False(root.TryGetProperty("success", out _));
            Assert.False(root.TryGetProperty("message", out _));
        }

        using var changed = await SendAsAsync(
            admin,
            HttpMethod.Post,
            $"/api/v1/admin/users/{target.User.Id}/roles",
            new { role = "Admin" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        using var changedDocument = JsonDocument.Parse(await changed.Content.ReadAsStringAsync());
        var changedRoot = changedDocument.RootElement;
        var result = changedRoot.GetProperty("data");
        Assert.Equal(target.User.Id, result.GetProperty("id").GetString());
        Assert.Contains(result.GetProperty("roles").EnumerateArray(), role => role.GetString() == "Admin");
        Assert.False(changedRoot.TryGetProperty("success", out _));
        Assert.False(changedRoot.TryGetProperty("message", out _));
    }

    [Fact]
    public async Task Invalid_role_missing_user_and_self_demotion_return_problem_details()
    {
        var admin = await CreateSessionAsync(isAdmin: true);

        using var invalidRole = await SendAsAsync(
            admin,
            HttpMethod.Post,
            $"/api/v1/admin/users/{admin.User.Id}/roles",
            new { role = "Guest" });
        await AssertProblemAsync(invalidRole, HttpStatusCode.UnprocessableEntity);

        using var missing = await SendAsAsync(
            admin,
            HttpMethod.Post,
            "/api/v1/admin/users/missing-user/roles",
            new { role = "Author" });
        await AssertProblemAsync(missing, HttpStatusCode.NotFound);

        using var selfDemotion = await SendAsAsync(
            admin,
            HttpMethod.Post,
            $"/api/v1/admin/users/{admin.User.Id}/roles",
            new { role = "Author" });
        using var document = await AssertProblemAsync(selfDemotion, HttpStatusCode.Conflict);
        Assert.Equal("ADMIN_SELF_DEMOTION", document.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Framework_generated_400_and_404_use_problem_details()
    {
        using var malformed = await fixture.Client.PostAsync(
            "/api/v1/auth/refresh",
            new StringContent("{bad-json", System.Text.Encoding.UTF8, "application/json"));
        await AssertProblemAsync(malformed, HttpStatusCode.BadRequest);

        using var missingRoute = await fixture.Client.GetAsync("/api/v1/unknown-endpoint");
        await AssertProblemAsync(missingRoute, HttpStatusCode.NotFound);
    }

    private async Task<AuthResponseDto> CreateSessionAsync(bool isAdmin)
    {
        using var scope = fixture.Services.CreateScope();
        var auth = scope.ServiceProvider.GetRequiredService<IAuthService>();
        var session = await auth.RegisterAsync(
            $"{Guid.NewGuid():N}@example.test",
            "Contract Test User",
            Password,
            CancellationToken.None);
        if (!isAdmin) return session;

        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        if (!await roles.RoleExistsAsync("Admin"))
        {
            var created = await roles.CreateAsync(new IdentityRole("Admin"));
            Assert.True(created.Succeeded);
        }

        var user = await users.FindByIdAsync(session.User.Id);
        Assert.NotNull(user);
        var assigned = await users.AddToRoleAsync(user!, "Admin");
        Assert.True(assigned.Succeeded);
        return await auth.LoginAsync(session.User.Email, Password, CancellationToken.None);
    }

    private async Task<HttpResponseMessage> SendAsAsync(
        AuthResponseDto session,
        HttpMethod method,
        string path,
        object? body = null)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        if (body is not null) request.Content = JsonContent.Create(body);
        return await fixture.Client.SendAsync(request);
    }

    private static async Task<JsonDocument> AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var correlationId = Assert.Single(response.Headers.GetValues("X-Correlation-ID"));
        var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal((int)status, root.GetProperty("status").GetInt32());
        Assert.Equal(correlationId, root.GetProperty("correlationId").GetString());
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("type").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("title").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("detail").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("instance").GetString()));
        Assert.Equal(JsonValueKind.Object, root.GetProperty("errors").ValueKind);
        return document;
    }
}
