using System.Text.Json;
using Asp.Versioning;
using CulinaryBlog.API.Documentation;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CulinaryBlog.Observability.Tests;

public sealed class ApiDocumentationTests
{
    [Fact]
    public async Task Admin_and_health_contracts_are_documented_for_frontend_issue_93()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(
            "Host=localhost;Database=openapi_only;Username=openapi;Password=openapi"));
        builder.Services.AddSingleton<IHealthDependencyProbe, DocumentationProbe>();
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
        app.NewVersionedApi().MapGroup("/api/v{version:apiVersion}").HasApiVersion(1.0).MapAdminEndpoints();
        app.MapHealthEndpoints();
        await app.StartAsync();

        using var client = app.GetTestClient();
        using var response = await client.GetAsync("/openapi/v1.json");
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(json);
        var paths = document.RootElement.GetProperty("paths");
        var list = paths.GetProperty("/api/v1/admin/users").GetProperty("get");
        var names = list.GetProperty("parameters").EnumerateArray()
            .Select(parameter => parameter.GetProperty("name").GetString()).ToArray();
        Assert.Contains("page", names);
        Assert.Contains("pageSize", names);
        Assert.Contains("role", names);
        foreach (var status in new[] { "200", "401", "403", "422" })
            Assert.True(list.GetProperty("responses").TryGetProperty(status, out _));
        var mutation = paths.GetProperty("/api/v1/admin/users/{userId}/roles").GetProperty("post");
        Assert.True(mutation.GetProperty("responses").TryGetProperty("409", out _));
        Assert.Contains("isActive", json, StringComparison.Ordinal);
        Assert.Contains("createdAt", json, StringComparison.Ordinal);
        Assert.DoesNotContain("passwordHash", json, StringComparison.OrdinalIgnoreCase);
        Assert.True(paths.TryGetProperty("/health/live", out _));
        Assert.True(paths.TryGetProperty("/health/ready", out _));
        Assert.True(paths.TryGetProperty("/health", out _) || paths.TryGetProperty("/health/", out _));
    }

    private sealed class DocumentationProbe : IHealthDependencyProbe
    {
        public Task<bool> DatabaseAsync(CancellationToken cancellationToken) => Task.FromResult(true);
        public Task<bool> RedisAsync(CancellationToken cancellationToken) => Task.FromResult(true);
        public Task<bool> StorageAsync(CancellationToken cancellationToken) => Task.FromResult(true);
    }

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
