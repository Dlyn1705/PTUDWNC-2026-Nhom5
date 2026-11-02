using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using CulinaryBlog.API.Logging;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application.Common.Metrics;
using CulinaryBlog.Application.Common.Behaviors;
using CulinaryBlog.Application.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using CulinaryBlog.Infrastructure.Persistence;
using OpenTelemetry.Trace;
using OpenTelemetry.Metrics;
using Serilog;
using Serilog.Formatting.Compact;
using Xunit;

namespace CulinaryBlog.Observability.Tests;

public sealed class Issue83SinkTests
{
    [Fact]
    public async Task Unavailable_Seq_and_OTLP_do_not_fail_the_HTTP_request()
    {
        var receiver = new WireReceiver(); var unavailable = receiver.Url; await receiver.DisposeAsync();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["Observability:File:Enabled"] = "false",
            ["Observability:Seq:Enabled"] = "true", ["Observability:Seq:ServerUrl"] = unavailable,
            ["Observability:OpenTelemetry:Enabled"] = "true", ["Observability:OpenTelemetry:Endpoint"] = unavailable,
            ["Observability:OpenTelemetry:Protocol"] = "http/protobuf"
        });
        builder.AddStructuredLogging(); builder.Services.AddObservability(builder.Configuration);
        await using var app = builder.Build();
        app.UseMiddleware<CorrelationIdMiddleware>(); app.UseStructuredRequestLogging();
        app.MapGet("/ok", () => "ok"); await app.StartAsync();
        using var http = new HttpClient(); var response = await http.GetAsync(app.Urls.Single() + "/ok");
        response.EnsureSuccessStatusCode(); Assert.Equal("ok", await response.Content.ReadAsStringAsync());
        app.Services.GetRequiredService<TracerProvider>().ForceFlush(1000);
        // Even after an attempted export to a closed listener, subsequent requests still succeed.
        (await http.GetAsync(app.Urls.Single() + "/ok")).EnsureSuccessStatusCode();
        await app.StopAsync();
    }

    [Fact]
    public async Task Slow_use_case_emits_warning_at_default_500ms_without_serializing_its_request()
    {
        var events = new EventSink();
        using var logger = new LoggerConfiguration().Enrich.FromLogContext().WriteTo.Sink(
            new SafeLogSink(new LoggerConfiguration().WriteTo.Sink(events).CreateLogger())).CreateLogger();
        using var factory = new LoggerFactory().AddSerilog(logger);
        var behavior = new LoggingBehavior<string, string>(factory.CreateLogger<LoggingBehavior<string, string>>(),
            new WireGuest(), Options.Create(new StructuredLoggingOptions()));
        await behavior.Handle("SECRET_REQUEST", async _ => { await Task.Delay(550); return "SECRET_RESPONSE"; }, CancellationToken.None);
        var entry = Assert.Single(events.Events);
        Assert.Equal(Serilog.Events.LogEventLevel.Warning, entry.Level);
        Assert.True(Convert.ToDouble(EventSink.Value(entry, "Elapsed")) > 500);
        Assert.DoesNotContain("SECRET", entry.RenderMessage());
    }

    [Fact]
    public async Task Seq_sink_delivers_sanitized_event_to_receiver_or_configured_live_Seq()
    {
        var configured = Environment.GetEnvironmentVariable("ISSUE83_SEQ_URL");
        await using var receiver = configured is null ? new WireReceiver() : null;
        var url = configured ?? receiver!.Url;
        var correlation = "issue83-seq-" + Guid.NewGuid().ToString("N");
        using (var logger = new LoggerConfiguration().WriteTo.Sink(new SafeLogSink(new LoggerConfiguration()
            .WriteTo.Seq(url).CreateLogger())).CreateLogger())
            logger.ForContext("CorrelationId", correlation).ForContext("EventType", "ApplicationRequestCompleted")
                .Error(new Exception("SECRET_EXCEPTION"), "SECRET_LITERAL {Password}", "SECRET_PASSWORD");
        if (receiver is not null)
        {
            await receiver.WaitFor("/api/events/raw");
            Assert.DoesNotContain("SECRET", string.Join('\n', receiver.Bodies.Select(Encoding.UTF8.GetString)));
        }
        else
        {
            using var http = new HttpClient { BaseAddress = new Uri(url) };
            string events = "";
            for (var i = 0; i < 50; i++)
            {
                events = await http.GetStringAsync("/api/events?count=100");
                if (events.Contains(correlation)) break;
                await Task.Delay(100);
            }
            Assert.Contains(correlation, events); Assert.DoesNotContain("SECRET_", events);
        }
    }

    [Fact]
    public void File_rollover_retention_and_all_payload_containers_are_sanitized()
    {
        var directory = Path.Combine(Path.GetTempPath(), "culinary-log-test-" + Guid.NewGuid().ToString("N"));
        var options = new LogFileOptions { Directory = directory, RetainedFileCountLimit = 2, FileSizeLimitBytes = 1024 };
        try
        {
            var path = options.FilePath(Path.GetTempPath(), null);
            using (var output = new LoggerConfiguration().WriteTo.File(new CompactJsonFormatter(), path,
                rollingInterval: RollingInterval.Day, rollOnFileSizeLimit: true, fileSizeLimitBytes: 1024, retainedFileCountLimit: 2).CreateLogger())
            using (var logger = new LoggerConfiguration().WriteTo.Sink(new SafeLogSink(output)).CreateLogger())
            {
                for (var i = 0; i < 100; i++)
                    logger.ForContext("UserId", "private@example.invalid").ForContext("RequestPath", "/recipes?token=SECRET")
                        .Error(new IOException("SECRET", new Exception("SECRET")), "SECRET literal {Payload}", new { token = "SECRET" });
            }
            var files = Directory.GetFiles(directory); Assert.InRange(files.Length, 1, 2);
            var json = string.Join('\n', files.Select(File.ReadAllText));
            Assert.DoesNotContain("SECRET", json); Assert.DoesNotContain("private@", json);
            Assert.DoesNotContain("ExceptionStackTrace", json); Assert.Contains("ExceptionType", json);
            Assert.Contains(DateTime.Now.ToString("yyyyMMdd"), Path.GetFileName(files[0]));
        }
        finally { if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true); }
    }

    [Fact]
    public void File_options_reject_public_paths_invalid_retention_and_instance_names()
    {
        var root = Path.Combine(Path.GetTempPath(), "culinary-options");
        Assert.Throws<InvalidOperationException>(() => new LogFileOptions { Directory = "wwwroot/logs" }.FilePath(root, null));
        Assert.Throws<InvalidOperationException>(() => new LogFileOptions { RetainedFileCountLimit = 0 }.FilePath(root, null));
        Assert.Throws<InvalidOperationException>(() => new LogFileOptions { InstanceName = "../private" }.FilePath(root, null));
    }

    [Fact]
    public async Task Production_OTLP_pipeline_exports_clean_traces_and_metrics_over_HTTP()
    {
        await using var receiver = new WireReceiver();
        var events = new EventSink();
        using var logger = new LoggerConfiguration().Enrich.FromLogContext().WriteTo.Sink(
            new SafeLogSink(new LoggerConfiguration().WriteTo.Sink(events).CreateLogger())).CreateLogger();
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        builder.Host.UseSerilog(logger, dispose: false);
        builder.Services.Configure<StructuredLoggingOptions>(_ => { });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
            ["Observability:OpenTelemetry:Enabled"] = "true",
            ["Observability:OpenTelemetry:Endpoint"] = receiver.Url,
            ["Observability:OpenTelemetry:Protocol"] = "http/protobuf"
        });
        builder.Services.AddObservability(builder.Configuration);
        await using var app = builder.Build();
        app.UseMiddleware<CorrelationIdMiddleware>();
        app.UseStructuredRequestLogging();
        app.MapGet("/trace/{id}", async (ILogger<LoggingBehavior<string, string>> log) => {
            Activity.Current!.SetTag("user.email", "SECRET_EMAIL");
            Activity.Current.TraceStateString = "vendor=SECRET_TRACE_STATE";
            Activity.Current.SetTag("db.statement", "SELECT SECRET_SQL");
            Activity.Current.SetTag("url.full", "https://example.invalid/?token=SECRET_TOKEN");
            if (Environment.GetEnvironmentVariable("OBS_TEST_CONNECTION") is { Length: > 0 } connection)
            {
                await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connection).Options);
                await db.Database.ExecuteSqlRawAsync("SELECT 1 /* SECRET_SQL_TEXT */");
            }
            DiagnosticsConfig.RecipePublishedCounter.Add(1);
            var behavior = new LoggingBehavior<string, string>(log, new WireGuest(), Options.Create(new StructuredLoggingOptions()));
            return await behavior.Handle("SECRET_BODY", _ => Task.FromResult("ok"), CancellationToken.None);
        });
        app.MapGet("/event", () => { Activity.Current!.AddEvent(new ActivityEvent("SECRET_EVENT")); return "ok"; });
        await app.StartAsync();
        using var client = new HttpClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, app.Urls.Single() + "/trace/SECRET_PATH?token=SECRET_QUERY");
        request.Headers.Add("X-Correlation-ID", "issue83-wire");
        var response = await client.SendAsync(request); response.EnsureSuccessStatusCode();
        Assert.Equal("issue83-wire", response.Headers.GetValues("X-Correlation-ID").Single());
        (await client.GetAsync(app.Urls.Single() + "/event")).EnsureSuccessStatusCode();
        Assert.True(app.Services.GetRequiredService<TracerProvider>().ForceFlush(10000));
        Assert.True(app.Services.GetRequiredService<MeterProvider>().ForceFlush(10000));
        await receiver.WaitFor("/v1/traces"); await receiver.WaitFor("/v1/metrics");
        var wire = string.Join('\n', receiver.Bodies.Select(Encoding.UTF8.GetString));
        Assert.DoesNotContain("SECRET", wire); Assert.Contains("issue83-wire", wire);
        Assert.Contains("recipe.published", wire); Assert.Contains("CulinaryBlog.API", wire);
        if (Environment.GetEnvironmentVariable("OBS_TEST_CONNECTION") is { Length: > 0 }) Assert.Contains("postgresql", wire);
        var http = Assert.Single(events.Http, entry => EventSink.Value(entry, "CorrelationId") as string == "issue83-wire");
        var application = Assert.Single(events.Events, entry => EventSink.Value(entry, "EventType") as string == "ApplicationRequestCompleted");
        Assert.Equal("issue83-wire", EventSink.Value(application, "CorrelationId"));
        Assert.Equal(EventSink.Value(http, "TraceId"), EventSink.Value(application, "TraceId"));
        Assert.NotNull(EventSink.Value(http, "TraceId"));
        await app.StopAsync();
    }

    [Fact]
    public void Disabled_telemetry_has_no_exporter_and_unapproved_event_spans_are_not_recorded()
    {
        var services = new ServiceCollection(); services.AddLogging();
        services.AddObservability(new ConfigurationBuilder().Build());
        using var provider = services.BuildServiceProvider(); Assert.Null(provider.GetService<TracerProvider>());
        using var activity = new Activity("SECRET").Start(); activity.ActivityTraceFlags = ActivityTraceFlags.Recorded;
        activity.AddEvent(new ActivityEvent("SECRET")); new SafeTelemetryProcessor().OnEnd(activity);
        Assert.False(activity.Recorded); Assert.DoesNotContain("SECRET", activity.DisplayName);
    }

    private sealed class WireGuest : ICurrentUserService
    {
        public string? UserId => null;
        public string? Email => null;
        public IReadOnlyList<string> Roles => [];
        public bool IsAuthenticated => false;
        public bool IsAdmin => false;
    }
}

internal sealed class WireReceiver : IAsyncDisposable
{
    private readonly HttpListener listener = new();
    private readonly Task worker;
    public string Url { get; }
    public System.Collections.Concurrent.ConcurrentBag<byte[]> Bodies { get; } = [];
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, bool> paths = new();
    public WireReceiver()
    {
        var socket = new TcpListener(IPAddress.Loopback, 0); socket.Start(); var port = ((IPEndPoint)socket.LocalEndpoint).Port; socket.Stop();
        Url = $"http://127.0.0.1:{port}/"; listener.Prefixes.Add(Url); listener.Start();
        worker = Task.Run(async () => {
            try {
                while (listener.IsListening) {
                    var context = await listener.GetContextAsync();
                    using var body = new MemoryStream(); await context.Request.InputStream.CopyToAsync(body);
                    Bodies.Add(body.ToArray()); paths[context.Request.Url!.AbsolutePath] = true;
                    context.Response.StatusCode = 200; context.Response.ContentType = "application/x-protobuf";
                    context.Response.Close();
                }
            } catch (Exception error) when (error is HttpListenerException or ObjectDisposedException) { }
        });
    }
    public async Task WaitFor(string path)
    {
        for (var i = 0; i < 100 && !paths.ContainsKey(path); i++) await Task.Delay(50);
        Assert.True(paths.ContainsKey(path), "Exporter did not send " + path);
    }
    public async ValueTask DisposeAsync() { listener.Close(); await worker; }
}
