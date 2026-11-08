using System.Threading;
using System.Threading.Tasks;

namespace CulinaryBlog.Application.Contracts;

public interface IEmailService
{
    Task SendWelcomeEmailAsync(string toEmail, string userName, CancellationToken ct = default);

    // Business identity survives queue redelivery. Existing transports remain compatible;
    // a stable Message-ID is correlation only, not an SMTP deduplication guarantee.
    Task SendWelcomeEmailAsync(Guid deliveryId, string toEmail, string userName, CancellationToken ct = default)
        => SendWelcomeEmailAsync(toEmail, userName, ct);
}
