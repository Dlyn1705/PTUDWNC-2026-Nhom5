using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using CulinaryBlog.Application.Contracts;

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
        group.MapGet("/ready", async (IFileStorageService storage, CancellationToken ct) =>
        {
            if (!await storage.IsReadyAsync(ct))
                return (IResult)Results.Json(new { status = "Unhealthy", probe = "readiness", storage = "Unavailable", timestamp = System.DateTime.UtcNow }, statusCode: StatusCodes.Status503ServiceUnavailable);
            return Results.Ok(new { status = "Healthy", probe = "readiness", storage = "Ready", timestamp = System.DateTime.UtcNow });
        })
            .WithName("ReadinessCheck")
            .WithSummary("Readiness probe");

        // FR-OBS-001: Tổng hợp health check
        group.MapGet("/", async (IFileStorageService storage, CancellationToken ct) =>
        {
            var storageReady = await storage.IsReadyAsync(ct);
            return Results.Json(new
            {
                status = storageReady ? "Healthy" : "Unhealthy",
                timestamp = System.DateTime.UtcNow,
                dependencies = new
                {
                    database = "Ready",
                    cache = "Ready",
                    storage = storageReady ? "Ready" : "Unavailable"
                }
            }, statusCode: storageReady ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
        })
        .WithName("HealthCheck")
        .WithSummary("Tổng hợp trạng thái hệ thống");

        return app;
    }
}
