namespace CulinaryBlog.API.Security;

public static class PerformanceCapacityExtensions
{
    // Validate before registering policies. Two independent opt-ins; production cannot enable this override.
    public static IServiceCollection AddPerformanceCapacity(this IServiceCollection services,
        IConfiguration config, IHostEnvironment environment)
    {
        if (!config.GetValue<bool>("Performance:CapacityMode")) return services;
        if (!environment.IsEnvironment("Performance"))
            throw new InvalidOperationException("CapacityMode requires the isolated Performance environment.");
        return services;
    }
}
