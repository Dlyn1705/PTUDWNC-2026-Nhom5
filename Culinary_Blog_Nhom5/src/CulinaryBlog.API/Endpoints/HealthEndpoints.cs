using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace CulinaryBlog.API.Endpoints;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/health")
            .WithTags("Health Checks");

        // Liveness intentionally does not call any dependency. The process is
        // alive as long as the web server can answer this request.
        group.MapGet("/live", () => Results.Ok(new
            {
                status = "Healthy",
                probe = "liveness",
                timestamp = DateTime.UtcNow
            }))
            .WithName("LivenessCheck")
            .WithSummary("Liveness probe");

        group.MapGet("/ready", (
                HealthCheckService healthChecks,
                CancellationToken cancellationToken) =>
            ExecuteHealthCheckAsync(healthChecks, readinessOnly: true, "readiness", cancellationToken))
            .WithName("ReadinessCheck")
            .WithSummary("Readiness probe");

        group.MapGet("/", (
                HealthCheckService healthChecks,
                CancellationToken cancellationToken) =>
            ExecuteHealthCheckAsync(healthChecks, readinessOnly: false, "full", cancellationToken))
            .WithName("HealthCheck")
            .WithSummary("Tổng hợp trạng thái hệ thống");

        return app;
    }

    private static async Task<IResult> ExecuteHealthCheckAsync(
        HealthCheckService healthChecks,
        bool readinessOnly,
        string probe,
        CancellationToken cancellationToken)
    {
        var report = await healthChecks.CheckHealthAsync(
            registration => !readinessOnly || registration.Tags.Contains("ready"),
            cancellationToken);

        var dependencies = report.Entries.ToDictionary(
            entry => entry.Key,
            entry => entry.Value.Status == HealthStatus.Healthy ? "Ready" : "Unavailable",
            StringComparer.OrdinalIgnoreCase);

        var details = report.Entries.ToDictionary(
            entry => entry.Key,
            entry => new
            {
                status = entry.Value.Status.ToString(),
                description = entry.Value.Description,
                durationMs = entry.Value.Duration.TotalMilliseconds
            },
            StringComparer.OrdinalIgnoreCase);

        var healthy = report.Status == HealthStatus.Healthy;
        return Results.Json(
            new
            {
                status = report.Status.ToString(),
                probe,
                dependencies,
                details,
                timestamp = DateTime.UtcNow
            },
            statusCode: healthy ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable,
            contentType: "application/health+json");
    }
}
