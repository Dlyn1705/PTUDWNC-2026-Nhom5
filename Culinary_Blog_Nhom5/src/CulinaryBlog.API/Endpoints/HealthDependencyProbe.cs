using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;

namespace CulinaryBlog.API.Endpoints;

public interface IHealthDependencyProbe
{
    Task<bool> DatabaseAsync(CancellationToken cancellationToken);
    Task<bool> RedisAsync(CancellationToken cancellationToken);
    Task<bool> StorageAsync(CancellationToken cancellationToken);
}

public sealed class HealthDependencyProbe(
    ApplicationDbContext database,
    IDistributedCache cache,
    IServiceProvider services) : IHealthDependencyProbe
{
    public Task<bool> DatabaseAsync(CancellationToken cancellationToken) =>
        database.Database.CanConnectAsync(cancellationToken);

    public async Task<bool> RedisAsync(CancellationToken cancellationToken)
    {
        // A cache miss is healthy: the call proves Redis accepted a command.
        await cache.GetAsync("health:probe", cancellationToken);
        return true;
    }

    public Task<bool> StorageAsync(CancellationToken cancellationToken) =>
        services.GetRequiredService<IFileStorageService>().IsReadyAsync(cancellationToken);
}
