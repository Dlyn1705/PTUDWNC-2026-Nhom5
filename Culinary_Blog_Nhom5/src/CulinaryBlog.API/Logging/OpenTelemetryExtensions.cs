using CulinaryBlog.Application.Common.Metrics;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace Microsoft.Extensions.DependencyInjection;

public static class OpenTelemetryExtensions
{
    public static IServiceCollection AddObservability(this IServiceCollection services, IConfiguration configuration)
    {
        var enabled = configuration.GetValue<bool>("Observability:OpenTelemetry:Enabled");
        if (!enabled)
        {
            return services;
        }

        var resourceBuilder = ResourceBuilder.CreateDefault()
            .AddService(DiagnosticsConfig.ServiceName);

        services.AddOpenTelemetry()
            .WithTracing(tracing =>
            {
                tracing.SetResourceBuilder(resourceBuilder)
                    .AddAspNetCoreInstrumentation(options =>
                    {
                        options.RecordException = false;
                        options.EnrichWithHttpResponse = (activity, response) =>
                            activity.SetTag("correlation.id", response.HttpContext.Items[CulinaryBlog.API.Logging.RequestLogContext.CorrelationHeader]);
                    })
                    .AddHttpClientInstrumentation()
                    .AddEntityFrameworkCoreInstrumentation();

                tracing.AddProcessor(new CulinaryBlog.API.Logging.SafeTelemetryProcessor());
                tracing.AddOtlpExporter(options =>
                {
                    if (configuration["Observability:OpenTelemetry:Endpoint"] is { Length: > 0 } endpoint)
                        options.Endpoint = new Uri(endpoint, UriKind.Absolute);
                    if (configuration["Observability:OpenTelemetry:Protocol"] == "http/protobuf")
                    {
                        options.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.HttpProtobuf;
                        if (configuration["Observability:OpenTelemetry:Endpoint"] is { Length: > 0 } baseEndpoint)
                            options.Endpoint = new Uri(baseEndpoint.TrimEnd('/') + "/v1/traces");
                    }
                });
                
                if (configuration.GetValue<bool>("Observability:OpenTelemetry:UseConsoleExporter"))
                {
                    tracing.AddConsoleExporter();
                }
            })
            .WithMetrics(metrics =>
            {
                metrics.SetResourceBuilder(resourceBuilder)
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation()
                    .AddView("*", new MetricStreamConfiguration { TagKeys = Array.Empty<string>() })
                    .AddMeter(DiagnosticsConfig.MeterName);

                metrics.AddOtlpExporter(options =>
                {
                    if (configuration["Observability:OpenTelemetry:Endpoint"] is { Length: > 0 } endpoint)
                        options.Endpoint = new Uri(endpoint, UriKind.Absolute);
                    if (configuration["Observability:OpenTelemetry:Protocol"] == "http/protobuf")
                    {
                        options.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.HttpProtobuf;
                        if (configuration["Observability:OpenTelemetry:Endpoint"] is { Length: > 0 } baseEndpoint)
                            options.Endpoint = new Uri(baseEndpoint.TrimEnd('/') + "/v1/metrics");
                    }
                });
                
                if (configuration.GetValue<bool>("Observability:OpenTelemetry:UseConsoleExporter"))
                {
                    metrics.AddConsoleExporter();
                }
            });

        return services;
    }
}
