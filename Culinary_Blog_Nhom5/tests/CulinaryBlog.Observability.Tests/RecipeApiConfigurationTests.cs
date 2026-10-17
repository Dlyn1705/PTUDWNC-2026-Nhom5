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
    [Fact]
    public async Task ReadLimitReturnsProblemAndRetryAfter()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddRecipeApiConfiguration();
        await using var app = builder.Build();
        app.UseRateLimiter();
        app.MapGet("/read", () => "ok").RequireRateLimiting("recipe-read");
        await app.StartAsync();
        using var client = app.GetTestClient();
        for (var i = 0; i < 120; i++)
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
