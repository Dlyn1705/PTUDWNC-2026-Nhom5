using System.Diagnostics;
using CulinaryBlog.Application.Contracts;
using Hangfire;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services.Email;

public sealed class WelcomeEmailJob(WelcomeEmailStore store, IEmailService email, ILogger<WelcomeEmailJob> logger)
{
    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 60, 300, 900 }, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task SendAsync(Guid messageId, CancellationToken ct)
    {
        var claim = await store.ClaimAsync(messageId, ct);
        if (claim is null) return;
        var elapsed = Stopwatch.StartNew();
        try
        {
            await email.SendWelcomeEmailAsync(claim.RecipientEmail, claim.DisplayName, ct);
        }
        catch (Exception error)
        {
            var code = error is OperationCanceledException ? "TransportInterrupted" : "TransportFailure";
            await store.FailAsync(claim, code, CancellationToken.None);
            logger.LogWarning("Welcome email {EmailMessageId} attempt {Attempt} failed with {ErrorCategory}", messageId, claim.Attempt, code);
            // Never persist the raw SMTP exception/recipient in Hangfire failure details.
            if (ct.IsCancellationRequested) throw new OperationCanceledException(ct);
            throw new WelcomeEmailSendException();
        }
        // A DB failure here must leave Processing for recovery, not claim that SMTP rejected the message.
        await store.CompleteAsync(claim, CancellationToken.None);
        logger.LogInformation("Welcome email {EmailMessageId} sent for {UserId} on attempt {Attempt} in {Elapsed} ms",
            messageId, claim.UserId, claim.Attempt, elapsed.Elapsed.TotalMilliseconds);
    }
}

public sealed class WelcomeEmailSendException() : Exception("Welcome email transport failed; consult delivery status and sanitized diagnostics.");
