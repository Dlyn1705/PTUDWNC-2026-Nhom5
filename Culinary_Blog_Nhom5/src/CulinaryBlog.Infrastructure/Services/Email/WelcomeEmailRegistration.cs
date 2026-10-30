using CulinaryBlog.Application.Contracts;
using Hangfire;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace CulinaryBlog.Infrastructure.Services.Email;

public static class WelcomeEmailRegistration
{
    public static IServiceCollection AddWelcomeEmail(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<WelcomeEmailOptions>().Bind(configuration.GetSection("Email")).ValidateOnStart();
        services.AddSingleton<IValidateOptions<WelcomeEmailOptions>, WelcomeEmailOptionsValidator>();
        services.TryAddSingleton(TimeProvider.System);
        services.AddTransient<IEmailService, SmtpWelcomeEmailService>();
        services.AddTransient<IPasswordResetEmailSender, SmtpPasswordResetEmailSender>();
        services.AddTransient<WelcomeEmailStore>();
        services.AddTransient<WelcomeEmailJob>();
        services.AddTransient<WelcomeEmailDispatcher>();
        return services;
    }

    public static void RegisterWelcomeEmailJobs(this IRecurringJobManager manager) =>
        manager.AddOrUpdate<WelcomeEmailDispatcher>("dispatch-welcome-emails", job => job.DispatchAsync(CancellationToken.None), Cron.Minutely);
}
