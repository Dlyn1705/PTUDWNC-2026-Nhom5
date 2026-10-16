using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.Extensions.Logging;

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
        group.MapGet("/ready", async (
            ApplicationDbContext db,
            IFileStorageService storage,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("HealthEndpoints");
            var databaseReady = await CheckDatabaseAsync(db, logger, ct);
            var storageReady = await storage.IsReadyAsync(ct);
            var healthy = databaseReady && storageReady;
            return Results.Json(new
            {
                status = healthy ? "Healthy" : "Unhealthy",
                probe = "readiness",
                dependencies = new
                {
                    database = databaseReady ? "Ready" : "Unavailable",
                    storage = storageReady ? "Ready" : "Unavailable"
                },
                timestamp = System.DateTime.UtcNow
            }, statusCode: healthy ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
        })
            .WithName("ReadinessCheck")
            .WithSummary("Readiness probe");

        // FR-OBS-001: Tổng hợp health check
        group.MapGet("/", async (
            ApplicationDbContext db,
            IFileStorageService storage,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("HealthEndpoints");
            var databaseReady = await CheckDatabaseAsync(db, logger, ct);
            var storageReady = await storage.IsReadyAsync(ct);
            var healthy = databaseReady && storageReady;
            return Results.Json(new
            {
                status = healthy ? "Healthy" : "Unhealthy",
                timestamp = System.DateTime.UtcNow,
                dependencies = new
                {
                    database = databaseReady ? "Ready" : "Unavailable",
                    cache = "NotConfigured",
                    storage = storageReady ? "Ready" : "Unavailable"
                }
            }, statusCode: healthy ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
        })
        .WithName("HealthCheck")
        .WithSummary("Tổng hợp trạng thái hệ thống");

        return app;
    }

    private static async Task<bool> CheckDatabaseAsync(
        ApplicationDbContext db,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        try
        {
            return await db.Database.CanConnectAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Database health probe failed.");
            return false;
        }
    }
}
