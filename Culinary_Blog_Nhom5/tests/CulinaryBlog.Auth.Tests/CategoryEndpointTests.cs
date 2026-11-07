using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace CulinaryBlog.Auth.Tests;

public sealed class CategoryEndpointTests : IAsyncLifetime
{
    private readonly AuthFixture fixture = new();
    public Task InitializeAsync() => fixture.InitializeAsync();
    public Task DisposeAsync() => fixture.DisposeAsync();

    [Fact]
    public async Task Category_routes_cover_crud_slug_stability_validation_and_guest_authorization()
    {
        using var scope = fixture.Services.CreateScope();
        var auth = scope.ServiceProvider.GetRequiredService<IAuthService>();
        var session = await auth.RegisterAsync($"category-{Guid.NewGuid():N}@example.test", "Category Admin", "Only-Test-Password1!", default);
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        Assert.True((await roles.CreateAsync(new IdentityRole("Admin"))).Succeeded);
        var user = (await users.FindByIdAsync(session.User.Id))!;
        Assert.True((await users.AddToRoleAsync(user, "Admin")).Succeeded);
        session = await auth.LoginAsync(session.User.Email, "Only-Test-Password1!", default);
        async Task<HttpResponseMessage> Send(HttpMethod method, string path, object? input = null)
        {
            using var request = new HttpRequestMessage(method, path);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
            if (input is not null) request.Content = JsonContent.Create(input);
            return await fixture.Client.SendAsync(request);
        }
        using var guestCreate = await fixture.Client.PostAsJsonAsync("/api/v1/categories", new { name = "Món nước" });
        Assert.Equal(HttpStatusCode.Unauthorized, guestCreate.StatusCode);
        using var invalid = await Send(HttpMethod.Post, "/api/v1/categories", new { name = "x" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalid.StatusCode);
        using var created = await Send(HttpMethod.Post, "/api/v1/categories", new { name = "Món nước", description = "Test" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var json = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var data = json.RootElement.GetProperty("data"); var id = data.GetProperty("id").GetGuid(); var slug = data.GetProperty("slug").GetString();
        using var duplicate = await Send(HttpMethod.Post, "/api/v1/categories", new { name = "Món nước" });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        using var list = await fixture.Client.GetAsync("/api/v1/categories");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var detail = await fixture.Client.GetAsync($"/api/v1/categories/{slug}");
        Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        using var missing = await fixture.Client.GetAsync("/api/v1/categories/missing-category");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        using var guestUpdate = await fixture.Client.PutAsJsonAsync($"/api/v1/categories/{id}", new { name = "Món mới" });
        Assert.Equal(HttpStatusCode.Unauthorized, guestUpdate.StatusCode);
        using var updated = await Send(HttpMethod.Put, $"/api/v1/categories/{id}", new { id, name = "Món mới" });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        using var after = JsonDocument.Parse(await updated.Content.ReadAsStringAsync());
        Assert.Equal(slug, after.RootElement.GetProperty("data").GetProperty("slug").GetString());
        using var guestDelete = await fixture.Client.DeleteAsync($"/api/v1/categories/{id}");
        Assert.Equal(HttpStatusCode.Unauthorized, guestDelete.StatusCode);
        using var deleted = await Send(HttpMethod.Delete, $"/api/v1/categories/{id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        using var gone = await fixture.Client.GetAsync($"/api/v1/categories/{slug}");
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
        using var wrongMethod = await fixture.Client.PostAsync("/api/v1/categories", null);
        Assert.Equal(HttpStatusCode.Unauthorized, wrongMethod.StatusCode);
    }
}
