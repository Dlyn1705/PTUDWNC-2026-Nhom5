using System.Collections.Concurrent;
using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using CulinaryBlog.API.Logging;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application.Common.Behaviors;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Exceptions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Serilog;
using Serilog.Core;
using Serilog.Events;
using Serilog.Formatting.Compact;
using Xunit;

namespace CulinaryBlog.Observability.Tests;

public sealed class EventSink : ILogEventSink
{
    public ConcurrentQueue<LogEvent> Events { get; } = new();
    public void Emit(LogEvent logEvent) => Events.Enqueue(logEvent);
    public LogEvent[] Http => Events.Where(e => Value(e, "EventType") as string == "HttpRequestCompleted").ToArray();
    public static object? Value(LogEvent e, string name) =>
        e.Properties.TryGetValue(name, out var value) && value is ScalarValue scalar ? scalar.Value : null;
}

public sealed class LoggingTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("abc.DEF_123-456", true)]
    [InlineData("a,b", false)]
    [InlineData("has space", false)]
    [InlineData("TiếngViệt", false)]
    public void Correlation_validation(string? id, bool valid) =>
        Assert.Equal(valid, RequestLogContext.IsValidCorrelationId(id));

    [Theory]
    [InlineData(200, 999, false, LogEventLevel.Information)]
    [InlineData(200, 1000, false, LogEventLevel.Information)]
    [InlineData(200, 1001, false, LogEventLevel.Warning)]
    [InlineData(401, 10, false, LogEventLevel.Warning)]
    [InlineData(500, 1001, false, LogEventLevel.Error)]
    [InlineData(200, 10, true, LogEventLevel.Warning)]
    public void Level_boundary(int status, double elapsed, bool canceled, LogEventLevel expected) =>
        Assert.Equal(expected, StructuredLoggingExtensions.RequestLevel(status, elapsed, canceled, new()));

    [Theory]
    [InlineData("/ok", 200)]
    [InlineData("/private", 401)]
    [InlineData("/admin", 403)]
    [InlineData("/missing", 404)]
    [InlineData("/throw/409", 409)]
    [InlineData("/throw/422", 422)]
    [InlineData("/throw/423", 423)]
    [InlineData("/limited", 429)]
    [InlineData("/throw/500", 500)]
    public async Task Http_summary_covers_success_rejections_and_errors(string path, int status)
    {
        await using var host = await TestHost.Create();
        if (path == "/limited")
        {
            await host.Client.GetAsync(path);
            host.Sink.Events.Clear();
        }
        using var request = new HttpRequestMessage(HttpMethod.Get, path + "?password=SECRET_MARKER");
        request.Headers.Add("X-Correlation-ID", "test-request");
        request.Headers.Add("Origin", "http://localhost:3000");
        if (path == "/admin") request.Headers.Add("Test-User", "author-1");
        var response = await host.Client.SendAsync(request);
        Assert.Equal(status, (int)response.StatusCode);
        Assert.Equal("test-request", response.Headers.GetValues("X-Correlation-ID").Single());
        Assert.Contains("X-Correlation-ID", string.Join(",", response.Headers.GetValues("Access-Control-Expose-Headers")),
            StringComparison.OrdinalIgnoreCase);
        var entry = Assert.Single(host.Sink.Http);
        Assert.Equal(path, EventSink.Value(entry, "RequestPath"));
        Assert.Equal("GET", EventSink.Value(entry, "RequestMethod"));
        Assert.Equal(status, EventSink.Value(entry, "StatusCode"));
        Assert.Equal("test-request", EventSink.Value(entry, "CorrelationId"));
        Assert.True(Convert.ToDouble(EventSink.Value(entry, "Elapsed")) >= 0);
        Assert.True(entry.Properties.ContainsKey("UserId"));
        Assert.Equal(path == "/admin" ? "author-1" : null, EventSink.Value(entry, "UserId"));
        if (path.StartsWith("/throw"))
        {
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal("test-request", body.RootElement.GetProperty("correlationId").GetString());
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
            Assert.DoesNotContain("SECRET_MARKER", await response.Content.ReadAsStringAsync());
        }
        Assert.DoesNotContain("SECRET_MARKER", Render(host.Sink.Events));
        if (status == 500)
        {
            var detail = Assert.Single(host.Sink.Events, e => EventSink.Value(e, "EventType") as string == "UnhandledException");
            Assert.Equal("System.InvalidOperationException", EventSink.Value(detail, "ExceptionType"));
        }
    }

    [Fact]
    public async Task Invalid_and_multiple_headers_are_replaced_and_parallel_scopes_do_not_leak()
    {
        await using var host = await TestHost.Create();
        foreach (var values in new[] { new[] { new string('x', 129) }, new[] { "one", "two" }, new[] { "bad value" } })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/ok");
            request.Headers.TryAddWithoutValidation("X-Correlation-ID", values);
            var response = await host.Client.SendAsync(request);
            Assert.True(Guid.TryParse(response.Headers.GetValues("X-Correlation-ID").Single(), out _));
        }
        await Task.WhenAll(Enumerable.Range(0, 100).Select(async i =>
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/ok");
            request.Headers.Add("X-Correlation-ID", $"parallel-{i}");
            request.Headers.Add("Test-User", $"user-{i}");
            Assert.Equal(HttpStatusCode.OK, (await host.Client.SendAsync(request)).StatusCode);
        }));
        for (var i = 0; i < 100; i++)
        {
            var events = host.Sink.Events.Where(e => EventSink.Value(e, "CorrelationId") as string == $"parallel-{i}");
            Assert.Contains(events, e => EventSink.Value(e, "UserId") as string == $"user-{i}");
            Assert.All(events.Where(e => e.Properties.ContainsKey("UserId")),
                e => Assert.Equal($"user-{i}", EventSink.Value(e, "UserId")));
        }
        await host.Client.GetAsync("/ok");
        Assert.Null(EventSink.Value(host.Sink.Http.Last(), "UserId"));
    }

    [Fact]
    public async Task Write_audit_from_main_keeps_its_fields_and_has_one_http_summary()
    {
        await using var host = await TestHost.Create();
        await host.Client.PostAsync("/audit", new StringContent("SECRET_MARKER"));
        var audit = Assert.Single(host.Sink.Events, e => EventSink.Value(e, "SourceContext") as string
            == typeof(RequestAuditMiddleware).FullName);
        Assert.Equal("POST", EventSink.Value(audit, "Method"));
        Assert.Equal("/audit", EventSink.Value(audit, "Path"));
        Assert.IsType<DateTimeOffset>(EventSink.Value(audit, "OccurredAtUtc"));
        Assert.Single(host.Sink.Http);
        Assert.DoesNotContain("SECRET_MARKER", Render(host.Sink.Events));
    }

    [Fact]
    public async Task Error_after_response_started_preserves_sent_status_and_logs_failure_once()
    {
        await using var host = await TestHost.Create();
        await Assert.ThrowsAnyAsync<Exception>(async () =>
        {
            var response = await host.Client.GetAsync("/started");
            await response.Content.ReadAsStringAsync();
        });
        var entry = Assert.Single(host.Sink.Http);
        Assert.Equal(200, EventSink.Value(entry, "StatusCode"));
        Assert.Equal("Failed", EventSink.Value(entry, "Outcome"));
        Assert.Equal(LogEventLevel.Error, entry.Level);
        Assert.False(entry.Properties.ContainsKey("ExceptionStackTrace"));
        Assert.Single(host.Sink.Events, e => EventSink.Value(e, "EventType") as string == "UnhandledException");
    }

    [Fact]
    public async Task Exception_keeps_authenticated_user_after_inner_scope_is_disposed()
    {
        await using var host = await TestHost.Create();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/throw/500");
        request.Headers.Add("Test-User", "author-123");
        await host.Client.SendAsync(request);
        var detail = Assert.Single(host.Sink.Events, e => EventSink.Value(e, "EventType") as string == "UnhandledException");
        Assert.Equal("author-123", EventSink.Value(detail, "UserId"));
        Assert.Equal("author-123", EventSink.Value(Assert.Single(host.Sink.Http), "UserId"));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    public async Task Invalid_threshold_fails_validation(string threshold)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Observability:SlowRequestThresholdMs"] = threshold,
            ["Observability:Seq:Enabled"] = "true",
            ["Observability:Seq:ServerUrl"] = "not-a-url"
        });
        builder.AddStructuredLogging();
        // Production ignores the development Seq sink, even when Enabled=true.
        await using var app = builder.Build();
        Assert.Throws<OptionsValidationException>(() =>
            app.Services.GetRequiredService<IOptions<StructuredLoggingOptions>>().Value);
    }

    [Theory]
    [InlineData("operation")]
    [InlineData("io")]
    public async Task Aborted_request_is_canceled_without_problem_body(string kind)
    {
        await using var host = await TestHost.Create();
        var response = await host.Client.GetAsync($"/cancel/{kind}");
        Assert.Equal(499, (int)response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.Equal("Canceled", EventSink.Value(Assert.Single(host.Sink.Http), "Outcome"));
    }

    [Fact]
    public void Sanitization_removes_exception_messages_and_unapproved_properties_for_all_sinks()
    {
        var sink = new EventSink();
        using var output = new LoggerConfiguration().WriteTo.Sink(sink).CreateLogger();
        using var logger = new LoggerConfiguration().WriteTo.Sink(new SafeLogSink(output)).CreateLogger();
        logger.Error(new InvalidOperationException("SECRET_MARKER", new Exception("INNER_SECRET")),
            "Failure with {Password} and {Parameters}", "PASSWORD_SECRET", new { token = "TOKEN_SECRET" });
        var json = Render(sink.Events);
        Assert.DoesNotContain("SECRET", json);
        Assert.Contains("ExceptionType", json);
        Assert.Contains("[REDACTED]", json);
    }

    [Theory]
    [InlineData("Succeeded", LogEventLevel.Information)]
    [InlineData("Failed", LogEventLevel.Error)]
    [InlineData("Expected", LogEventLevel.Warning)]
    [InlineData("Canceled", LogEventLevel.Warning)]
    public async Task Cqrs_completion_records_all_outcomes_and_rethrows(string outcome, LogEventLevel level)
    {
        var sink = new EventSink();
        using var logger = new LoggerConfiguration().Enrich.FromLogContext().WriteTo.Sink(sink).CreateLogger();
        using var factory = new LoggerFactory().AddSerilog(logger);
        var behavior = new LoggingBehavior<string, string>(factory.CreateLogger<LoggingBehavior<string, string>>(),
            new Guest(), Options.Create(new StructuredLoggingOptions()));
        using var cancel = new CancellationTokenSource();
        if (outcome == "Canceled") cancel.Cancel();
        Exception failure = outcome == "Expected" ? new ForbiddenException()
            : outcome == "Canceled" ? new OperationCanceledException(cancel.Token) : new InvalidOperationException("SECRET");
        if (outcome == "Succeeded")
            Assert.Equal("ok", await behavior.Handle("SECRET", _ => Task.FromResult("ok"), cancel.Token));
        else
        {
            var caught = await Record.ExceptionAsync(() => behavior.Handle("SECRET", _ => Task.FromException<string>(failure), cancel.Token));
            Assert.Same(failure, caught);
        }
        var entry = Assert.Single(sink.Events);
        Assert.Equal(level, entry.Level);
        Assert.Equal(outcome == "Expected" ? "Failed" : outcome, EventSink.Value(entry, "Outcome"));
        Assert.Equal("ApplicationRequestCompleted", EventSink.Value(entry, "EventType"));
        Assert.DoesNotContain("SECRET", Render(sink.Events));
    }

    [Fact]
    public async Task Cqrs_handler_logs_are_not_labeled_as_completion_events()
    {
        var sink = new EventSink();
        using var output = new LoggerConfiguration().Enrich.FromLogContext().WriteTo.Sink(sink).CreateLogger();
        using var factory = new LoggerFactory().AddSerilog(output);
        var behavior = new LoggingBehavior<string, string>(factory.CreateLogger<LoggingBehavior<string, string>>(),
            new Guest(), Options.Create(new StructuredLoggingOptions()));
        var handlerLogger = factory.CreateLogger("Handler");

        await behavior.Handle("request", _ =>
        {
            handlerLogger.LogWarning("Handler diagnostic event");
            return Task.FromResult("ok");
        }, CancellationToken.None);

        var completion = Assert.Single(sink.Events,
            entry => EventSink.Value(entry, "EventType") as string == "ApplicationRequestCompleted");
        Assert.Equal("String", EventSink.Value(completion, "RequestName"));
        var handlerEvent = Assert.Single(sink.Events,
            entry => EventSink.Value(entry, "SourceContext") as string == "Handler");
        Assert.Null(EventSink.Value(handlerEvent, "EventType"));
    }

    private static string Render(IEnumerable<LogEvent> events)
    {
        using var text = new StringWriter();
        var formatter = new CompactJsonFormatter();
        foreach (var entry in events) formatter.Format(entry, text);
        return text.ToString();
    }

    private sealed class Guest : ICurrentUserService
    {
        public string? UserId => null;
        public string? Email => null;
        public IReadOnlyList<string> Roles => [];
        public bool IsAuthenticated => false;
        public bool IsAdmin => false;
    }
}

internal sealed class TestHost(WebApplication app, Logger logger, EventSink sink) : IAsyncDisposable
{
    public HttpClient Client { get; } = app.GetTestClient();
    public EventSink Sink => sink;
    public static async Task<TestHost> Create()
    {
        var sink = new EventSink();
        var logger = new LoggerConfiguration().Enrich.FromLogContext()
            .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
            .WriteTo.Sink(new SafeLogSink(new LoggerConfiguration().WriteTo.Sink(sink).CreateLogger())).CreateLogger();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.WebHost.UseTestServer();
        builder.Host.UseSerilog(logger, dispose: false);
        builder.Services.Configure<StructuredLoggingOptions>(_ => { });
        builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, TestAuth>("Test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins("http://localhost:3000")
            .AllowAnyHeader().AllowAnyMethod().WithExposedHeaders(RequestLogContext.CorrelationHeader)));
        builder.Services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = 429;
            o.AddPolicy("deny", (HttpContext _) => System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter("test",
                _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                { PermitLimit = 1, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));
        });
        var app = builder.Build();
        app.UseMiddleware<CorrelationIdMiddleware>();
        app.UseStructuredRequestLogging();
        app.UseMiddleware<RequestAuditMiddleware>();
        app.UseMiddleware<GlobalExceptionMiddleware>();
        app.UseCors();
        app.UseAuthentication();
        app.UseMiddleware<UserLogContextMiddleware>();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapGet("/ok", async (ILogger<LoggingTests> log) =>
        {
            await Task.Yield();
            log.LogInformation("Endpoint reached");
            return Results.Ok();
        });
        app.MapGet("/private", () => Results.Ok()).RequireAuthorization();
        app.MapPost("/audit", () => Results.NoContent());
        app.MapGet("/admin", () => Results.Ok()).RequireAuthorization(p => p.RequireRole("Admin"));
        app.MapGet("/limited", () => Results.Ok()).RequireRateLimiting("deny");
        app.MapGet("/throw/{status:int}", (int status) =>
        {
            throw status switch
            {
                409 => new ConflictException("Conflict"),
                422 => new ValidationException("field", "Invalid"),
                423 => new LockedException(),
                _ => new InvalidOperationException("SECRET_MARKER")
            };
#pragma warning disable CS0162
            return Results.Ok();
#pragma warning restore CS0162
        });
        app.MapGet("/cancel/{kind}", (HttpContext context, string kind) =>
        {
            context.RequestAborted = new CancellationToken(true);
            throw kind == "io" ? new IOException("Connection aborted")
                : new OperationCanceledException(context.RequestAborted);
#pragma warning disable CS0162
            return Results.Ok();
#pragma warning restore CS0162
        });
        app.MapGet("/started", async (HttpContext context) =>
        {
            await context.Response.WriteAsync("partial");
            await context.Response.Body.FlushAsync();
            throw new InvalidOperationException("SECRET_MARKER");
        });
        await app.StartAsync();
        return new TestHost(app, logger, sink);
    }
    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await app.DisposeAsync();
        await logger.DisposeAsync();
    }
}

internal sealed class TestAuth(IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var user = Request.Headers["Test-User"].FirstOrDefault();
        return Task.FromResult(user is null ? AuthenticateResult.NoResult()
            : AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(
                new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user)], "Test")), "Test")));
    }
}
