using System.Net;
using System.Net.Http.Headers;
using System.Net.Http;
using System.Reflection;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Asp.Versioning;
using Hangfire;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace CulinaryBlog.Observability.Tests;

[CollectionDefinition("Program startup", DisableParallelization = true)]
public class ProgramStartupCollection;

[Collection("Program startup")]
public class ProgramSecurityTests
{
    [Fact]
    public void Every_protected_mutation_has_server_side_authorization_metadata()
    {
        using var factory = new SecurityFactory();
        _ = factory.CreateClient();
        var publicAuth = new HashSet<string>(StringComparer.Ordinal)
        {
            "/auth/google", "/auth/register", "/auth/login", "/auth/refresh",
            "/auth/logout", "/auth/forgot-password", "/auth/reset-password"
        };
        var mutations = factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(endpoint => endpoint.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods
                .Any(method => method is "POST" or "PUT" or "PATCH" or "DELETE") == true)
            .Where(endpoint => endpoint.RoutePattern.RawText?.StartsWith("/api/v", StringComparison.Ordinal) == true)
            .ToArray();
        Assert.True(mutations.Length >= 25, $"Only {mutations.Length} mutation routes were inventoried.");
        foreach (var endpoint in mutations)
        {
            var route = endpoint.RoutePattern.RawText!;
            if (publicAuth.Any(route.EndsWith)) continue;
            var policies = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Select(data => data.Policy).ToArray();
            Assert.NotEmpty(policies);
            if (route.Contains("/categories", StringComparison.Ordinal)
                || route.Contains("/admin/", StringComparison.Ordinal))
                Assert.Contains("AdminOnly", policies);
            else if (route.Contains("/recipes", StringComparison.Ordinal))
                Assert.Contains("AuthorPolicy", policies);
        }
    }

    [Fact]
    public void Production_caps_multipart_file_section_before_form_binding()
    {
        using var factory = new SecurityFactory();
        _ = factory.CreateClient();
        Assert.Equal(5 * 1024 * 1024,
            factory.Services.GetRequiredService<IOptions<FormOptions>>().Value.MultipartBodyLengthLimit);
    }

    [Fact]
    public async Task Oversized_multipart_section_is_rejected_before_endpoint_runs()
    {
        await using var factory = new SecurityFactory();
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        using var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(new byte[5 * 1024 * 1024 + 1]), "file", "large.png");
        using var response = await client.PostAsync("/security-test/form", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Production_redirects_http_to_https_and_sets_hsts_only_on_https()
    {
        await using var factory = new SecurityFactory();
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("http://localhost"),
            AllowAutoRedirect = false });
        using var redirect = await client.GetAsync("/api/v1/auth/ping");
        Assert.Equal(HttpStatusCode.TemporaryRedirect, redirect.StatusCode);
        Assert.Equal("https://localhost/api/v1/auth/ping", redirect.Headers.Location?.ToString());
        Assert.False(redirect.Headers.Contains("Strict-Transport-Security"));
        using var secure = await client.GetAsync("https://localhost/api/v1/auth/ping");
        Assert.Equal("max-age=31536000", Assert.Single(secure.Headers.GetValues("Strict-Transport-Security")));
    }

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
    [InlineData("upload", 30)]
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

    [Fact]
    public async Task Jwt_challenge_and_forbidden_responses_use_problem_details_with_correlation()
    {
        await using var factory = new SecurityFactory();
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });

        using var unauthenticated = await client.GetAsync("/api/v1/admin/users");
        await AssertProblemWithCorrelationAsync(unauthenticated, HttpStatusCode.Unauthorized);
        Assert.Equal("Bearer", Assert.Single(unauthenticated.Headers.GetValues("WWW-Authenticate")));

        var token = new JwtSecurityToken(
            issuer: "CulinaryBlog",
            audience: "CulinaryBlogWeb",
            claims:
            [
                new Claim(ClaimTypes.NameIdentifier, "author-1"),
                new Claim(ClaimTypes.Role, "Author")
            ],
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-test-key-at-least-32-bytes-long")),
                SecurityAlgorithms.HmacSha256));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", new JwtSecurityTokenHandler().WriteToken(token));

        using var forbidden = await client.GetAsync("/api/v1/admin/users");
        await AssertProblemWithCorrelationAsync(forbidden, HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Api_contract_xml_comments_appear_in_openapi()
    {
        await using var factory = new SecurityFactory();
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var json = await client.GetStringAsync("/openapi/v1.json");
        Assert.Contains("the refresh token is only sent as an HttpOnly cookie", json, StringComparison.Ordinal);
        Assert.Contains("Bearer token for authenticated API calls.", json, StringComparison.Ordinal);
        Assert.Contains("Replacement nutrition values and optional body version for concurrency control.", json, StringComparison.Ordinal);
        Assert.Contains("Process liveness without dependency checks.", json, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Named_application_operations_have_openapi_summaries()
    {
        await using var factory = new SecurityFactory();
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        using var document = JsonDocument.Parse(await client.GetStringAsync("/openapi/v1.json"));
        var operations = document.RootElement.GetProperty("paths").EnumerateObject()
            .SelectMany(path => path.Value.EnumerateObject())
            .Select(entry => entry.Value)
            .Where(operation => operation.ValueKind == JsonValueKind.Object && operation.TryGetProperty("operationId", out _))
            .ToArray();
        Assert.NotEmpty(operations);
        foreach (var operation in operations)
        {
            var id = operation.GetProperty("operationId").GetString();
            Assert.True(operation.TryGetProperty("summary", out var summary) && !string.IsNullOrWhiteSpace(summary.GetString()), id);
        }
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

    private static async Task AssertProblemWithCorrelationAsync(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var correlationId = Assert.Single(response.Headers.GetValues("X-Correlation-ID"));
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var problem = document.RootElement;
        Assert.Equal((int)status, problem.GetProperty("status").GetInt32());
        Assert.Equal(correlationId, problem.GetProperty("correlationId").GetString());
        Assert.False(string.IsNullOrWhiteSpace(problem.GetProperty("type").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(problem.GetProperty("detail").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(problem.GetProperty("instance").GetString()));
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
                    ["Hangfire:Dashboard:Enabled"] = "false",
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
                endpoints.MapPost("/security-test/form", (IFormFile file) => Results.Ok(file.Length))
                    .DisableAntiforgery();
                // Test-only OpenAPI exposure; Production keeps its original visibility rules.
                endpoints.MapOpenApi().WithDocumentPerVersion();
            });
        };
    }
}
