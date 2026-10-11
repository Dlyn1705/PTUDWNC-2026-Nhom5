using CulinaryBlog.Application.Contracts;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class WelcomeEmailJob(IEmailService emailService)
{
    public Task ExecuteAsync(string email, string displayName) =>
        emailService.SendWelcomeEmailAsync(email, displayName);
}
