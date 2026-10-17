using System.Net;
using System.Reflection;
using System.Text.Json;
using Asp.Versioning;
using Hangfire;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace CulinaryBlog.Observability.Tests;

[CollectionDefinition("Program startup", DisableParallelization = true)]
public class ProgramStartupCollection;

[Collection("Program startup")]
public class ProgramSecurityTests
{
    [Fact]
    public async Task AllPoliciesShareTheGlobalIpBudgetInProgram()
    {
        await using var factory = new SecurityFactory();
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        foreach (var (path, count) in new[]
        {
            ("/api/v1/auth/ping", 10),
            ("/api/security-test/upload", 5),
            ("/api/security-test/recipe-write", 30),
            ("/api/security-test/recipe-read", 55)
        })
        {
            for (var i = 0; i < count; i++)
            {
                using var response = await client.GetAsync(path);
                Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            }
        }
        // Read policy still has permits; the combined 100-request IP budget is exhausted.
        using var rejected = await client.GetAsync("/api/security-test/recipe-read");
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.NotNull(rejected.Headers.RetryAfter);
    }

    [Theory]
    [InlineData("auth", 10)]
    [InlineData("upload", 5)]
    [InlineData("recipe-read", 100)]
    [InlineData("recipe-write", 30)]
    public async Task ProgramPoliciesReturn429WithCorsAndRetryAfter(string policy, int limit)
    {
        await using var factory = new SecurityFactory();
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Add("Origin", SecurityFactory.Origin);
        // Auth uses the real public endpoint; probes exercise the other registered policies
        // without calling PostgreSQL or MinIO, through Program's actual middleware pipeline.
        var path = policy == "auth" ? "/api/v1/auth/ping" : $"/api/security-test/{policy}";
        for (var i = 0; i < limit; i++)
        {
            using var response = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        using var rejected = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.NotNull(rejected.Headers.RetryAfter);
        Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);
        Assert.Equal(SecurityFactory.Origin, Assert.Single(rejected.Headers.GetValues("Access-Control-Allow-Origin")));
        var exposed = string.Join(",", rejected.Headers.GetValues("Access-Control-Expose-Headers"));
        Assert.Contains("Retry-After", exposed, StringComparison.OrdinalIgnoreCase);
        using var problem = JsonDocument.Parse(await rejected.Content.ReadAsStringAsync());
        Assert.Equal(429, problem.RootElement.GetProperty("status").GetInt32());
    }

    [Theory]
    [InlineData("https://frontend.example.test", true)]
    [InlineData("https://frontend.example.test.evil.test", false)]
    [InlineData("http://localhost:3000", false)]
    public async Task CorsOnlyAllowsConfiguredOrigin(string origin, bool allowed)
    {
        await using var factory = new SecurityFactory();
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/v1/auth/ping");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "GET");
        using var response = await client.SendAsync(request);
        Assert.Equal(allowed, response.Headers.Contains("Access-Control-Allow-Origin"));
        if (allowed)
        {
            Assert.Equal(origin, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
            Assert.Equal("true", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Credentials")));
        }
    }

    [Fact]
    public async Task AuthOpenApiIncludes429ProblemForEveryOperation()
    {
        await using var factory = new SecurityFactory();
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        using var document = JsonDocument.Parse(await client.GetStringAsync("/openapi/v1.json"));
        var paths = document.RootElement.GetProperty("paths").EnumerateObject()
            .Where(path => path.Name.StartsWith("/api/v1/auth/", StringComparison.Ordinal)).ToArray();
        Assert.NotEmpty(paths);
        foreach (var path in paths)
        foreach (var operation in path.Value.EnumerateObject().Where(p => p.Value.TryGetProperty("responses", out _)))
            Assert.True(operation.Value.GetProperty("responses").GetProperty("429")
                .GetProperty("content").TryGetProperty("application/problem+json", out _), path.Name);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("*")]
    [InlineData("https://frontend.example.test/path")]
    public void ProductionRefusesMissingOrInvalidCors(string? origin)
    {
        using var factory = new SecurityFactory(origin: origin);
        AssertStartupRejected(factory);
    }

    [Fact]
    public void ProductionRefusesDevelopmentJwtKey()
    {
        using var factory = new SecurityFactory(key: "SuperSecretKey_For_Development_Only_123456789");
        AssertStartupRejected(factory);
    }

    private static void AssertStartupRejected(SecurityFactory factory)
    {
        var previousExitCode = Environment.ExitCode;
        try
        {
            Assert.Throws<InvalidOperationException>(() => factory.CreateClient());
        }
        finally { Environment.ExitCode = previousExitCode; }
    }

    private sealed class SecurityFactory(string? origin = "https://frontend.example.test", string key = "integration-test-key-at-least-32-bytes-long")
        : WebApplicationFactory<Program>
    {
        public const string Origin = "https://frontend.example.test";

        protected override IHost CreateHost(IHostBuilder builder)
        {
            // Host configuration is available to top-level Program before builder.Build().
            builder.ConfigureHostConfiguration(configuration =>
            {
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=unused;Username=unused;Password=unused",
                    ["Minio:AccessKey"] = "unused-test",
                    ["Minio:SecretKey"] = "unused-test",
                    ["Jwt:Key"] = key,
                    ["Cors:AllowedOrigins:0"] = origin,
                    ["Database:SeedOnStartup"] = "false",
                    ["Database:MigrateOnStartup"] = "false",
                    ["AdminSeed:OnStartup"] = "false",
                    ["Serilog:MinimumLevel:Default"] = "Fatal"
                });
            });
            return base.CreateHost(builder);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Production");
            builder.ConfigureServices(services =>
            {
                // Replace external background work only; retain Program's security registrations.
                services.RemoveAll<IHostedService>();
                services.RemoveAll<IRecurringJobManager>();
                services.AddSingleton(DispatchProxy.Create<IRecurringJobManager, NoOpRecurringJobs>());
                services.AddSingleton<IStartupFilter, SecurityRoutes>();
            });
        }
    }

    public class NoOpRecurringJobs : DispatchProxy
    {
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => null;
    }

    private sealed class SecurityRoutes : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            next(app);
            app.UseEndpoints(endpoints =>
            {
                foreach (var policy in new[] { "auth", "upload", "recipe-read", "recipe-write" })
                    endpoints.MapGet($"/api/security-test/{policy}", () => Results.Ok())
                        .RequireRateLimiting(policy);
                // Test-only OpenAPI exposure; Production keeps its original visibility rules.
                endpoints.MapOpenApi().WithDocumentPerVersion();
            });
        };
    }
}
