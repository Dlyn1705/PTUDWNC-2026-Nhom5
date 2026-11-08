namespace CulinaryBlog.Application.Contracts;

public interface IPasswordResetEmailSender
{
    Task SendAsync(string email, string token, CancellationToken cancellationToken);
}
