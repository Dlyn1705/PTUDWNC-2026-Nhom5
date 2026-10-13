using CulinaryBlog.Application.Common.Behaviors;
using Microsoft.Extensions.Options;
using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;

namespace CulinaryBlog.API.Logging;

public static class StructuredLoggingExtensions
{
    public static Serilog.ILogger CreateBootstrapLogger() => new LoggerConfiguration()
        .WriteTo.Sink(new SafeLogSink(new LoggerConfiguration()
            .WriteTo.Console(new CompactJsonFormatter()).CreateLogger()))
        .CreateBootstrapLogger();

    public static void AddStructuredLogging(this WebApplicationBuilder builder)
    {
        builder.Services.AddOptions<StructuredLoggingOptions>()
            .Bind(builder.Configuration.GetSection(StructuredLoggingOptions.SectionName))
            .Validate(o => double.IsFinite(o.SlowRequestThresholdMs) && o.SlowRequestThresholdMs > 0,
                "SlowRequestThresholdMs must be positive and finite.")
            .ValidateOnStart();

        builder.Host.UseSerilog((context, services, configuration) =>
        {
            var output = new LoggerConfiguration().MinimumLevel.Verbose()
                .WriteTo.Console(new CompactJsonFormatter());
            var seq = context.Configuration.GetSection("Observability:Seq");
            if (context.HostingEnvironment.IsDevelopment() && seq.GetValue<bool>("Enabled"))
                output.WriteTo.Seq(seq["ServerUrl"] ?? "http://localhost:5341",
                    apiKey: seq["ApiKey"], queueSizeLimit: 10000, eventBodyLimitBytes: 65536);

            // Sinks stay in code after sanitization; configuration controls levels only.
            configuration.MinimumLevel.Is(context.Configuration.GetValue(
                    "Serilog:MinimumLevel:Default", LogEventLevel.Information))
                .Enrich.FromLogContext()
                .Enrich.WithProperty("Application", "CulinaryBlog.API")
                .Enrich.WithProperty("Environment", context.HostingEnvironment.EnvironmentName);
            foreach (var entry in context.Configuration.GetSection("Serilog:MinimumLevel:Override").GetChildren())
                if (Enum.TryParse<LogEventLevel>(entry.Value, true, out var level))
                    configuration.MinimumLevel.Override(entry.Key, level);
            configuration.WriteTo.Sink(new SafeLogSink(output.CreateLogger()));
        });
    }

    public static LogEventLevel RequestLevel(int status, double elapsed, bool canceled,
        StructuredLoggingOptions options) => canceled ? LogEventLevel.Warning
        : status >= 500 ? LogEventLevel.Error
        : status >= 400 || options.IsSlow(elapsed) ? LogEventLevel.Warning : LogEventLevel.Information;

    public static void UseStructuredRequestLogging(this WebApplication app)
    {
        var settings = app.Services.GetRequiredService<IOptions<StructuredLoggingOptions>>().Value;
        app.UseSerilogRequestLogging(options =>
        {
            options.Logger = app.Services.GetRequiredService<Serilog.ILogger>();
            options.IncludeQueryInRequestPath = false;
            options.GetMessageTemplateProperties = (context, path, elapsed, status) =>
            [
                new("RequestMethod", new ScalarValue(context.Request.Method)),
                new("RequestPath", new ScalarValue(path)),
                new("StatusCode", new ScalarValue(context.Response.HasStarted ? context.Response.StatusCode : status)),
                new("Elapsed", new ScalarValue(elapsed))
            ];
            options.GetLevel = (context, elapsed, exception) => RequestLevel(
                exception is not null && !context.RequestAborted.IsCancellationRequested
                    ? 500 : context.Response.StatusCode,
                elapsed, context.RequestAborted.IsCancellationRequested, settings);
            options.EnrichDiagnosticContext = (diagnostics, context) =>
            {
                diagnostics.Set("EventType", "HttpRequestCompleted");
                diagnostics.Set("CorrelationId", context.Items[RequestLogContext.CorrelationHeader]!);
                diagnostics.Set("UserId", RequestLogContext.UserId(context)!);
                diagnostics.Set("Outcome", context.RequestAborted.IsCancellationRequested ? "Canceled"
                    : context.Response.StatusCode >= 400 || context.Items.ContainsKey(RequestLogContext.FailedItem)
                        ? "Failed" : "Succeeded");
            };
        });
    }
}
