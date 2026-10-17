using System.Text.Json;
using Asp.Versioning;
using CulinaryBlog.API.Documentation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace CulinaryBlog.Observability.Tests;

public sealed class ApiDocumentationTests
{
    [Fact]
    public async Task Versioned_document_describes_bearer_only_for_protected_operations()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddAuthentication().AddJwtBearer();
        builder.Services.AddAuthorization(options => options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin")));
        builder.Services.AddApiVersioning(options => options.ApiVersionReader = new UrlSegmentApiVersionReader())
            .AddApiExplorer(options =>
            {
                options.GroupNameFormat = "'v'VVV";
                options.SubstituteApiVersionInUrl = true;
            })
            .AddOpenApi(options =>
            {
                options.Document.AddDocumentTransformer<BearerDocumentTransformer>();
                options.Document.AddOperationTransformer<AuthorizationOperationTransformer>();
            });
        await using var app = builder.Build();
        app.MapOpenApi().WithDocumentPerVersion();
        var v1 = app.NewVersionedApi().MapGroup("/api/v{version:apiVersion}").HasApiVersion(1.0);
        v1.MapGet("/public", () => "public");
        v1.MapGet("/admin", () => "private").RequireAuthorization("AdminOnly");
        v1.MapGet("/anonymous", () => "public").RequireAuthorization().AllowAnonymous();
        await app.StartAsync();
        using var client = app.GetTestClient();
        using var response = await client.GetAsync("/openapi/v1.json");
        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.Equal("bearer", root.GetProperty("components").GetProperty("securitySchemes").GetProperty("Bearer").GetProperty("scheme").GetString());
        var paths = root.GetProperty("paths");
        var admin = paths.GetProperty("/api/v1/admin").GetProperty("get");
        Assert.True(admin.GetProperty("security")[0].TryGetProperty("Bearer", out _));
        Assert.True(admin.GetProperty("responses").TryGetProperty("401", out _));
        Assert.True(admin.GetProperty("responses").TryGetProperty("403", out _));
        Assert.False(paths.GetProperty("/api/v1/public").GetProperty("get").TryGetProperty("security", out _));
        Assert.False(paths.GetProperty("/api/v1/anonymous").GetProperty("get").TryGetProperty("security", out _));
        using var unsupported = await client.GetAsync("/api/v2/public");
        Assert.False(unsupported.IsSuccessStatusCode);
    }
}
