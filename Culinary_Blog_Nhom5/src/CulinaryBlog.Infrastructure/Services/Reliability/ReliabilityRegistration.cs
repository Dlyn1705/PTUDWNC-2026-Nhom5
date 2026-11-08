using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.StackExchangeRedis;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CulinaryBlog.Infrastructure.Services.Reliability;

public static class ReliabilityRegistration
{
    public static IServiceCollection AddReliability(this IServiceCollection services, IConfiguration config)
    {
        services.AddKeyedSingleton<IDistributedCache>("redis-transport", (sp, _) =>
            new RedisCache(sp.GetRequiredService<IOptions<RedisCacheOptions>>()));
        services.AddScoped<IDistributedCache>(sp => new ResilientCache(
            sp.GetRequiredKeyedService<IDistributedCache>("redis-transport"),
            config.GetConnectionString("DefaultConnection")!,
            sp.GetRequiredService<ILogger<ResilientCache>>(),
            Math.Clamp(config.GetValue("Reliability:CacheTimeoutMs", 300), 50, 2000)));
        return services;
    }
}
