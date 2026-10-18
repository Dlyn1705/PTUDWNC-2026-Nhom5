using System.Net;
using System.Text.Json;
using CulinaryBlog.API.Endpoints;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using Asp.Versioning;

namespace CulinaryBlog.Observability.Tests;

public class RecipeApiConfigurationTests
{
    [Theory]
    [InlineData("recipe-read", 100)]
    [InlineData("recipe-write", 30)]
    public async Task NamedLimitReturnsProblemAndRetryAfter(string policy, int limit)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddRecipeApiConfiguration();
        await using var app = builder.Build();
        app.UseRateLimiter();
        app.MapGet("/read", () => "ok").RequireRateLimiting(policy);
        await app.StartAsync();
        using var client = app.GetTestClient();
        for (var i = 0; i < limit; i++)
        {
            using var success = await client.GetAsync("/read");
            Assert.Equal(HttpStatusCode.OK, success.StatusCode);
        }
        using var rejected = await client.GetAsync("/read");
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.NotNull(rejected.Headers.RetryAfter);
        Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task GlobalLimitSharesApiBudgetPerIpAcrossRoutesAndUsers()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        CulinaryBlog.API.Security.ApiSecurityExtensions.AddApiSecurity(builder.Services);
        builder.Services.AddRecipeApiConfiguration();
        await using var app = builder.Build();
        app.Use(async (context, next) =>
        {
            // Test-only connection/identity injection; production uses the actual connection IP.
            context.Connection.RemoteIpAddress = IPAddress.Parse(context.Request.Headers["Test-IP"].ToString());
            context.User = new System.Security.Claims.ClaimsPrincipal(
                new System.Security.Claims.ClaimsIdentity(new[]
                {
                    new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier,
                        context.Request.Headers["Test-User"].ToString())
                }, "test"));
            await next(context);
        });
        app.UseRateLimiter();
        app.MapGet("/api/v1/recipes", () => "ok").RequireRateLimiting("recipe-read");
        app.MapGet("/api/v1/categories", () => "ok");
        app.MapGet("/health/live", () => "ok");
        await app.StartAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("Test-IP", "192.0.2.1");
        client.DefaultRequestHeaders.Add("Test-User", "author-one");

        for (var i = 0; i < 100; i++)
        {
            using var success = await client.GetAsync(i % 2 == 0 ? "/api/v1/recipes" : "/api/v1/categories");
            Assert.Equal(HttpStatusCode.OK, success.StatusCode);
        }

        client.DefaultRequestHeaders.Remove("Test-User");
        client.DefaultRequestHeaders.Add("Test-User", "author-two");
        using var rejected = await client.GetAsync("/api/v1/categories");
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.NotNull(rejected.Headers.RetryAfter);
        Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);

        using var health = await client.GetAsync("/health/live");
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);

        client.DefaultRequestHeaders.Remove("Test-IP");
        client.DefaultRequestHeaders.Add("Test-IP", "192.0.2.2");
        using var otherIp = await client.GetAsync("/api/v1/categories");
        Assert.Equal(HttpStatusCode.OK, otherIp.StatusCode);
    }

    [Fact]
    public async Task OpenApiDocumentsVersionAndOnlyProtectedOperationsRequireBearer()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddRecipeApiConfiguration();
        builder.Services.AddAuthorization();
        builder.Services.AddApiVersioning(options => options.ApiVersionReader = new UrlSegmentApiVersionReader())
            .AddApiExplorer(options =>
            {
                options.GroupNameFormat = "'v'VVV";
                options.SubstituteApiVersionInUrl = true;
            }).AddOpenApi();
        await using var app = builder.Build();
        app.MapOpenApi().WithDocumentPerVersion();
        var v1 = app.NewVersionedApi().MapGroup("/api/v{version:apiVersion}").HasApiVersion(1.0);
        v1.MapGet("/public", () => "ok");
        v1.MapPost("/protected", () => "ok").RequireAuthorization();
        await app.StartAsync();
        using var client = app.GetTestClient();
        using var document = JsonDocument.Parse(await client.GetStringAsync("/openapi/v1.json"));
        var root = document.RootElement;
        Assert.Equal("1.0", root.GetProperty("info").GetProperty("version").GetString());
        Assert.Equal("bearer", root.GetProperty("components").GetProperty("securitySchemes")
            .GetProperty("Bearer").GetProperty("scheme").GetString());
        var paths = root.GetProperty("paths");
        Assert.True(paths.GetProperty("/api/v1/protected").GetProperty("post")
            .GetProperty("security")[0].TryGetProperty("Bearer", out _));
        var publicOperation = paths.GetProperty("/api/v1/public").GetProperty("get");
        Assert.True(!publicOperation.TryGetProperty("security", out var security) || security.GetArrayLength() == 0);
    }
}
