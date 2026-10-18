using Hangfire;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CulinaryBlog.Infrastructure.Services.Images;

public static class ImageProcessingRegistration
{
    public static IServiceCollection AddImageProcessing(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.AddScoped<ImageWorkLock>(); services.AddScoped<ImageProcessingStore>();
        services.AddScoped<ImageVariantStorage>(); services.AddScoped<ImageGenerationCleanup>();
        services.AddScoped<ImageVariantReconciler>();
        services.AddTransient<IImageVariantRenderer, IsolatedImageRenderer>(); services.AddScoped<ImageProcessingPipeline>();
        services.AddTransient<RecipeImageProcessingRecoveryJob>();
        return services;
    }
    public static void RegisterImageProcessingJobs(this IRecurringJobManager manager) =>
        manager.AddOrUpdate<RecipeImageProcessingRecoveryJob>("recover-pending-recipe-image-processing", job => job.EnqueuePendingAsync(CancellationToken.None), Cron.Minutely);
}
