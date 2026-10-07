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
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddEntityFrameworkCoreInstrumentation();

                tracing.AddOtlpExporter();
                
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
                    .AddMeter(DiagnosticsConfig.MeterName);

                metrics.AddOtlpExporter();
                
                if (configuration.GetValue<bool>("Observability:OpenTelemetry:UseConsoleExporter"))
                {
                    metrics.AddConsoleExporter();
                }
            });

        return services;
    }
}
