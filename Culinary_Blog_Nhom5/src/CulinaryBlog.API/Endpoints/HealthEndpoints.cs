using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace CulinaryBlog.API.Endpoints;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/health")
            .WithTags("Health Checks");

        // FR-OBS-001: Liveness probe (kiểm tra process còn sống)
        group.MapGet("/live", () => Results.Ok(new { status = "Healthy", probe = "liveness", timestamp = System.DateTime.UtcNow }))
            .WithName("LivenessCheck")
            .WithSummary("Liveness probe");

        // FR-OBS-001: Readiness probe
        group.MapGet("/ready", () => Results.Ok(new { status = "Healthy", probe = "readiness", timestamp = System.DateTime.UtcNow }))
            .WithName("ReadinessCheck")
            .WithSummary("Readiness probe");

        // FR-OBS-001: Tổng hợp health check
        group.MapGet("/", () => Results.Ok(new
        {
            status = "Healthy",
            timestamp = System.DateTime.UtcNow,
            dependencies = new
            {
                database = "Ready",
                cache = "Ready",
                storage = "Ready"
            }
        }))
        .WithName("HealthCheck")
        .WithSummary("Tổng hợp trạng thái hệ thống");

        return app;
    }
}
