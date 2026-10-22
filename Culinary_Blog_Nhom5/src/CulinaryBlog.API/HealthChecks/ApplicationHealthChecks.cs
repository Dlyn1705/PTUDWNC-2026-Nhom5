using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace CulinaryBlog.API.HealthChecks;

public static class ApplicationHealthCheckRegistration
{
    public static IServiceCollection AddApplicationHealthChecks(this IServiceCollection services)
    {
        services.AddHealthChecks()
            .AddCheck<PostgresHealthCheck>("database", tags: ["ready", "full"])
            .AddCheck<RedisHealthCheck>("redis", tags: ["ready", "full"])
            .AddCheck<MinioHealthCheck>("storage", tags: ["full"]);

        return services;
    }
}

public sealed class PostgresHealthCheck(
    ApplicationDbContext database,
    ILogger<PostgresHealthCheck> logger) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var isAvailable = await database.Database.CanConnectAsync(cancellationToken);
            return isAvailable
                ? HealthCheckResult.Healthy("PostgreSQL is accepting connections.")
                : HealthCheckResult.Unhealthy("PostgreSQL is not accepting connections.");
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "PostgreSQL health check failed.");
            return HealthCheckResult.Unhealthy("PostgreSQL health check failed.", exception);
        }
    }
}

public sealed class RedisHealthCheck(
    IDistributedCache cache,
    ILogger<RedisHealthCheck> logger) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _ = await cache.GetAsync($"health:probe:{Guid.NewGuid():N}", cancellationToken);
            return HealthCheckResult.Healthy("Redis is accepting commands.");
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Redis health check failed.");
            return HealthCheckResult.Unhealthy("Redis health check failed.", exception);
        }
    }
}

public sealed class MinioHealthCheck(
    IFileStorageService storage,
    ILogger<MinioHealthCheck> logger) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var isAvailable = await storage.IsReadyAsync(cancellationToken);
            return isAvailable
                ? HealthCheckResult.Healthy("MinIO is ready.")
                : HealthCheckResult.Unhealthy("MinIO is not ready.");
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "MinIO health check failed.");
            return HealthCheckResult.Unhealthy("MinIO health check failed.", exception);
        }
    }
}
