using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Auth.Commands.GoogleIdTokenLogin;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace CulinaryBlog.Auth.Tests;

public sealed class AuthEndpointBoundaryTests : IAsyncLifetime
{
    private readonly AvatarStorage storage = new();
    private readonly AuthFixture fixture = new();
    public Task InitializeAsync()
    {
        fixture.ConfigureServices = services => {
            services.AddTransient<IRequestHandler<GoogleIdTokenLoginCommand, AuthResponseDto>, GoogleContractHandler>();
            services.AddSingleton<IFileStorageService>(storage);
            services.AddRateLimiter(options => options.AddConcurrencyLimiter("upload", policy => policy.PermitLimit = 10));
        };
        return fixture.InitializeAsync();
    }
    public Task DisposeAsync() => fixture.DisposeAsync();

    [Fact]
    public async Task Google_endpoint_maps_validated_command_and_error_without_exposing_refresh_token()
    {
        using var success = await fixture.Client.PostAsJsonAsync("/api/v1/auth/google", new { idToken = "valid-contract-token" });
        Assert.Equal(HttpStatusCode.OK, success.StatusCode);
        var body = await success.Content.ReadAsStringAsync();
        Assert.DoesNotContain("contract-refresh", body);
        Assert.Contains("culinary_refresh_token=", Assert.Single(success.Headers.GetValues("Set-Cookie")));
        using var denied = await fixture.Client.PostAsJsonAsync("/api/v1/auth/google", new { idToken = "invalid-contract-token" });
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        // Provider cryptographic verification is intentionally not mocked as a claimed live Google acceptance test.
    }

    [Fact]
    public async Task Forgot_and_logout_reject_invalid_inputs_with_problem_details()
    {
        using var forgot = await fixture.Client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "invalid" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, forgot.StatusCode);
        using var unknown = await fixture.Client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = "unknown@example.test" });
        Assert.Equal(HttpStatusCode.Accepted, unknown.StatusCode);
        using var logout = await fixture.Client.PostAsJsonAsync("/api/v1/auth/logout", new { refreshToken = "invalid-token" });
        Assert.Equal(HttpStatusCode.Unauthorized, logout.StatusCode);
        Assert.Equal("application/problem+json", logout.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Profile_stats_and_avatar_cover_happy_authorization_and_invalid_content()
    {
        using var scope = fixture.Services.CreateScope();
        var auth = scope.ServiceProvider.GetRequiredService<IAuthService>();
        var session = await auth.RegisterAsync($"avatar-{Guid.NewGuid():N}@example.test", "Avatar Chef", "Only-Test-Password1!", default);
        using var guest = await fixture.Client.GetAsync("/api/v1/auth/me/recipe-stats");
        Assert.Equal(HttpStatusCode.Unauthorized, guest.StatusCode);
        using var statsRequest = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/me/recipe-stats");
        statsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        using var stats = await fixture.Client.SendAsync(statsRequest);
        Assert.Equal(HttpStatusCode.OK, stats.StatusCode);
        async Task<HttpResponseMessage> Upload(byte[] bytes)
        {
            using var input = new MultipartFormDataContent(); var file = new ByteArrayContent(bytes);
            file.Headers.ContentType = new MediaTypeHeaderValue("image/png"); input.Add(file, "file", "avatar.png");
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/me/avatar") { Content = input };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
            return await fixture.Client.SendAsync(request);
        }
        using var uploaded = await Upload([137, 80, 78, 71, 13, 10, 26, 10]);
        Assert.Equal(HttpStatusCode.OK, uploaded.StatusCode);
        using var json = JsonDocument.Parse(await uploaded.Content.ReadAsStringAsync());
        Assert.StartsWith("https://test.example/avatars/", json.RootElement.GetProperty("data").GetProperty("avatarUrl").GetString());
        using var invalid = await Upload([1, 2, 3]);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalid.StatusCode);
        Assert.Equal(1, storage.Uploads);
    }

    public sealed class GoogleContractHandler : IRequestHandler<GoogleIdTokenLoginCommand, AuthResponseDto>
    {
        public Task<AuthResponseDto> Handle(GoogleIdTokenLoginCommand request, CancellationToken ct) => request.IdToken == "valid-contract-token"
            ? Task.FromResult(new AuthResponseDto("contract-access", "contract-refresh", DateTime.UtcNow.AddMinutes(15), DateTime.UtcNow.AddDays(7), new UserDto("google-test", "google@example.test", "Google Chef"), ["Author"]))
            : throw new UnauthorizedAccessException("Invalid Google contract token");
    }
    private sealed class AvatarStorage : IFileStorageService
    {
        public int Uploads;
        public Task<bool> IsReadyAsync(CancellationToken ct = default) => Task.FromResult(true);
        public Task<string> UploadAsync(Stream stream, string key, string contentType, CancellationToken ct = default) { Uploads++; return Task.FromResult("https://test.example/" + key); }
        public Task<Stream> OpenReadAsync(string url, CancellationToken ct = default) => throw new NotSupportedException();
        public Task DeleteAsync(string url, CancellationToken ct = default) => Task.CompletedTask;
    }
}
