using System.Threading;
using System.Threading.Tasks;

namespace CulinaryBlog.Application.Contracts;

public interface IEmailService
{
    Task SendWelcomeEmailAsync(string toEmail, string userName, CancellationToken ct = default);
}
