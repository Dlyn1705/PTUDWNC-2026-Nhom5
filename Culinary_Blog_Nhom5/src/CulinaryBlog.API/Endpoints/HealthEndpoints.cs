using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace CulinaryBlog.API.Endpoints;

/// <summary>Process liveness without dependency checks.</summary>
public sealed record LivenessResponse(string Status, string Probe, DateTime Timestamp);
/// <summary>Database and cache availability for the readiness probe.</summary>
public sealed record ReadinessDependencies(string Database, string Cache);
/// <summary>Whether this instance is ready for application traffic.</summary>
public sealed record ReadinessResponse(string Status, string Probe, ReadinessDependencies Dependencies, DateTime Timestamp);
/// <summary>Database, cache and object storage availability.</summary>
public sealed record HealthDependencies(string Database, string Cache, string Storage);
/// <summary>Combined service status and dependency results.</summary>
public sealed record HealthResponse(string Status, HealthDependencies Dependencies, DateTime Timestamp);

public static class HealthEndpoints
{
    private static readonly TimeSpan DependencyTimeout = TimeSpan.FromSeconds(2);

    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/health").WithTags("Health Checks");

        // Traffic admission stays available during optional-cache outages. Full readiness
        // keeps its existing DB + Redis contract for monitoring and operators.
        group.MapGet("/traffic", async (IHealthDependencyProbe dependencies, HttpContext context, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var ready = await ProbeAsync(dependencies.DatabaseAsync, ct);
            return Results.Json(new { status = ready ? "Healthy" : "Unhealthy", probe = "traffic", timestamp = DateTime.UtcNow },
                statusCode: ready ? 200 : 503);
        }).WithName("TrafficReadinessCheck")
            .WithSummary("Traffic admission: PostgreSQL phải sẵn sàng, cache là tùy chọn")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status503ServiceUnavailable);

        group.MapGet("/live", (HttpContext context) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new LivenessResponse("Healthy", "liveness", DateTime.UtcNow));
        })
        .WithName("LivenessCheck")
        .WithSummary("Liveness probe: chỉ kiểm tra process HTTP còn hoạt động")
        .Produces<LivenessResponse>(StatusCodes.Status200OK);

        group.MapGet("/ready", async Task<IResult> (
            IHealthDependencyProbe dependencies, HttpContext context, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var database = ProbeAsync(dependencies.DatabaseAsync, ct);
            var cache = ProbeAsync(dependencies.RedisAsync, ct);
            await Task.WhenAll(database, cache);
            var ready = database.Result && cache.Result;
            return Results.Json(new ReadinessResponse(
                ready ? "Healthy" : "Unhealthy",
                "readiness",
                new ReadinessDependencies(State(database.Result), State(cache.Result)),
                DateTime.UtcNow),
                statusCode: ready ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
        })
        .WithName("ReadinessCheck")
        .WithSummary("Readiness probe: PostgreSQL và Redis phải sẵn sàng; không phụ thuộc MinIO")
        .Produces<ReadinessResponse>(StatusCodes.Status200OK)
        .Produces<ReadinessResponse>(StatusCodes.Status503ServiceUnavailable);

        group.MapGet("/", async Task<IResult> (
            IHealthDependencyProbe dependencies, HttpContext context, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var database = ProbeAsync(dependencies.DatabaseAsync, ct);
            var cache = ProbeAsync(dependencies.RedisAsync, ct);
            var storage = ProbeAsync(dependencies.StorageAsync, ct);
            await Task.WhenAll(database, cache, storage);
            var healthy = database.Result && cache.Result && storage.Result;
            return Results.Json(new HealthResponse(
                healthy ? "Healthy" : "Unhealthy",
                new HealthDependencies(State(database.Result), State(cache.Result), State(storage.Result)),
                DateTime.UtcNow),
                statusCode: healthy ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
        })
        .WithName("HealthCheck")
        .WithSummary("Tổng hợp trạng thái PostgreSQL, Redis và MinIO")
        .Produces<HealthResponse>(StatusCodes.Status200OK)
        .Produces<HealthResponse>(StatusCodes.Status503ServiceUnavailable);

        return app;
    }

    private static string State(bool ready) => ready ? "Ready" : "Unavailable";

    private static async Task<bool> ProbeAsync(
        Func<CancellationToken, Task<bool>> probe,
        CancellationToken requestAborted)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        timeout.CancelAfter(DependencyTimeout);
        try
        {
            return await probe(timeout.Token).WaitAsync(DependencyTimeout, requestAborted);
        }
        catch (OperationCanceledException) when (!requestAborted.IsCancellationRequested)
        {
            return false;
        }
        catch (TimeoutException)
        {
            timeout.Cancel();
            return false;
        }
        catch (Exception) when (!requestAborted.IsCancellationRequested)
        {
            // Health responses never include dependency exceptions or endpoints.
            return false;
        }
    }
}
