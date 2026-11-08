using CulinaryBlog.Infrastructure.Services.Jobs;
using System.Diagnostics;
using CulinaryBlog.Application.Contracts;
using Hangfire;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services.Email;

public sealed class WelcomeEmailJob(WelcomeEmailStore store, IEmailService email, ILogger<WelcomeEmailJob> logger)
{
    [AutomaticRetry(Attempts = BackgroundJobRetryPolicy.RetryCount, DelaysInSeconds = new[] { BackgroundJobRetryPolicy.FirstDelaySeconds, BackgroundJobRetryPolicy.SecondDelaySeconds, BackgroundJobRetryPolicy.ThirdDelaySeconds }, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task SendAsync(Guid messageId, CancellationToken ct)
    {
        WelcomeEmailClaim? claim;
        try { claim = await store.ClaimAsync(messageId, ct); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw new OperationCanceledException(ct); }
        catch { throw new WelcomeEmailSendException(); }
        if (claim is null) return;
        var elapsed = Stopwatch.StartNew();
        var submissionCheckpoint = false;
        try
        {
            await store.BeginSubmissionAsync(claim, ct);
            submissionCheckpoint = true;
            await email.SendWelcomeEmailAsync(claim.Id, claim.RecipientEmail, claim.DisplayName, ct);
        }
        catch (Exception error)
        {
            var safeToRetry = !submissionCheckpoint || error is EmailNotSubmittedException;
            var code = safeToRetry ? "TransportNotSubmitted" : "TransportOutcomeUnknown";
            try
            {
                if (safeToRetry) await store.FailAsync(claim, code, CancellationToken.None);
                else await store.HoldAsync(claim, code, CancellationToken.None);
            }
            catch { logger.LogWarning("Welcome email failure recording deferred for {EmailMessageId}; intent remains recoverable", messageId); }
            logger.LogWarning("Welcome email {EmailMessageId} attempt {Attempt} failed with {ErrorCategory} and {CorrelationId}", messageId, claim.Attempt, code, $"job-welcome-{messageId:N}");
            // Never persist the raw SMTP exception/recipient in Hangfire failure details.
            if (ct.IsCancellationRequested) throw new OperationCanceledException(ct);
            if (!safeToRetry) throw new WelcomeEmailOutcomeUnknownException();
            throw new WelcomeEmailSendException();
        }
        // A DB failure here must leave Processing for recovery, not claim that SMTP rejected the message.
        try { await store.CompleteAsync(claim, CancellationToken.None); }
        catch
        {
            try { await store.HoldAsync(claim, "AcceptanceFinalizeUnknown", CancellationToken.None); }
            catch { /* The pre-submit checkpoint survives a DB outage; recovery must not resend. */ }
            throw new WelcomeEmailFinalizeException();
        }
        logger.LogInformation("Welcome email {EmailMessageId} sent for {UserId} on attempt {Attempt} in {Elapsed} ms with {CorrelationId}",
            messageId, claim.UserId, claim.Attempt, elapsed.Elapsed.TotalMilliseconds, $"job-welcome-{messageId:N}");
    }
}

public sealed class WelcomeEmailSendException() : Exception("Welcome email transport failed; consult delivery status and sanitized diagnostics.");
public sealed class WelcomeEmailFinalizeException() : Exception("Welcome email acceptance outcome requires durable delivery reconciliation.");
public sealed class WelcomeEmailOutcomeUnknownException() : Exception("Welcome email outcome is unknown; automatic resend is blocked pending reconciliation.");
