using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Encodings.Web;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.API.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace CulinaryBlog.Security.Tests;

public sealed class ApiSecurityTests
{
    private static async Task<WebApplication> Create(string environment = "Production")
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = environment });
        builder.WebHost.UseTestServer();
        // Windows' default EventLog provider requires machine-level write
        // permission. These transport tests do not exercise logging.
        builder.Logging.ClearProviders();
        builder.Services.AddApiSecurity();
        builder.Services.AddAuthentication("Tests").AddScheme<AuthenticationSchemeOptions, AnonymousAuthentication>("Tests", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseMiddleware<ApiSecurityHeadersMiddleware>();
        app.UseMiddleware<CorrelationIdMiddleware>();
        // Test-only trusted transport address. Production never reads this header.
        app.Use(async (context, next) =>
        {
            context.Connection.RemoteIpAddress = IPAddress.Parse(context.Request.Headers["Test-IP"].FirstOrDefault() ?? "192.0.2.1");
            await next(context);
        });
        app.UseRouting(); app.UseAuthentication(); app.UseRateLimiter(); app.UseAuthorization();
        app.MapGet("/api/test", () => Results.Ok(new { value = true }));
        app.MapPost("/api/auth/test", () => Results.Ok()).RequireRateLimiting("auth");
        app.MapPost("/api/upload/test", () => Results.Ok()).RequireRateLimiting("upload");
        app.MapGet("/api/denied", () => Results.Ok()).RequireAuthorization();
        app.MapGet("/api/failure", () => Results.Problem(statusCode: 500));
        app.MapGet("/health/live", () => Results.Ok());
        app.MapGet("/scalar/v1", () => Results.Content("<html>Docs</html>", "text/html"));
        await app.StartAsync(); return app;
    }

    private sealed class AnonymousAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync() => Task.FromResult(AuthenticateResult.NoResult());
    }

    [Fact]
    public async Task Hundred_per_ip_then_429_with_retry_after_and_problem_details()
    {
        await using var app = await Create(); using var client = app.GetTestClient();
        for (var i = 0; i < 100; i++) Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "192.0.2.99");
        var blocked = await client.GetAsync("/api/test");
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        Assert.Equal("application/problem+json", blocked.Content.Headers.ContentType!.MediaType);
        Assert.InRange(blocked.Headers.RetryAfter!.Delta!.Value.TotalSeconds, 1, 60);
        var problem = await blocked.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(429, problem.GetProperty("status").GetInt32());
        Assert.Equal(blocked.Headers.GetValues("X-Correlation-ID").Single(), problem.GetProperty("correlationId").GetString());
        Assert.Equal("/api/test", problem.GetProperty("instance").GetString());
        Assert.Equal("nosniff", blocked.Headers.GetValues("X-Content-Type-Options").Single());
        client.DefaultRequestHeaders.Add("Test-IP", "192.0.2.2");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test")).StatusCode);
    }

    [Theory]
    [InlineData("/api/auth/test", 10)][InlineData("/api/upload/test", 5)]
    public async Task Named_limits_are_preserved(string path, int limit)
    {
        await using var app = await Create(); using var client = app.GetTestClient();
        for (var i = 0; i < limit; i++) Assert.Equal(HttpStatusCode.OK, (await client.PostAsync(path, null)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsync(path, null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test")).StatusCode);
    }

    [Fact]
    public async Task Global_limit_also_counts_named_routes_and_rejected_authorization()
    {
        await using var app = await Create(); using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/auth/test", null)).StatusCode);
        for (var i = 0; i < 99; i++) Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/denied")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsync("/api/upload/test", null)).StatusCode);
    }

    [Fact]
    public async Task Health_is_not_in_api_bucket_and_ipv4_mapped_addresses_share_bucket()
    {
        await using var app = await Create(); using var client = app.GetTestClient();
        for (var i = 0; i < 105; i++) Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
        for (var i = 0; i < 100; i++) Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/test")).StatusCode);
        client.DefaultRequestHeaders.Add("Test-IP", "::ffff:192.0.2.1");
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.GetAsync("/api/test")).StatusCode);
    }

    [Theory]
    [InlineData("/api/test")][InlineData("/api/denied")][InlineData("/api/failure")][InlineData("/missing")]
    public async Task Security_headers_cover_success_and_errors(string path)
    {
        await using var app = await Create(); using var client = app.GetTestClient();
        var response = await client.GetAsync(path);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("strict-origin-when-cross-origin", response.Headers.GetValues("Referrer-Policy").Single());
        Assert.Contains("camera=()", response.Headers.GetValues("Permissions-Policy").Single());
        Assert.Contains("default-src 'none'", response.Headers.GetValues("Content-Security-Policy").Single());
        Assert.False(response.Headers.Contains("Strict-Transport-Security"));
        Assert.Equal("max-age=31536000", (await client.GetAsync("https://api.example.invalid" + path)).Headers.GetValues("Strict-Transport-Security").Single());
    }

    [Fact]
    public async Task Development_docs_can_load_scalar_without_weakening_json_csp()
    {
        await using var app = await Create("Development"); using var client = app.GetTestClient();
        var docs = await client.GetAsync("/scalar/v1");
        Assert.Contains("https://cdn.jsdelivr.net", docs.Headers.GetValues("Content-Security-Policy").Single());
        Assert.DoesNotContain("unsafe-inline", (await client.GetAsync("/api/test")).Headers.GetValues("Content-Security-Policy").Single());
    }
}
