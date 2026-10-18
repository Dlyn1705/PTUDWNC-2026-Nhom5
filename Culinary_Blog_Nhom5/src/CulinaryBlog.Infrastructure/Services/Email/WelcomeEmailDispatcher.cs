using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure.Persistence;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CulinaryBlog.Infrastructure.Services.Email;

public sealed class WelcomeEmailDispatcher(IServiceScopeFactory scopes, IBackgroundJobClient jobs,
    JobStorage storage, IOptions<WelcomeEmailOptions> settings, TimeProvider clock, ILogger<WelcomeEmailDispatcher> logger)
{
    [AutomaticRetry(Attempts = 0)]
    public async Task DispatchAsync(CancellationToken ct)
    {
        if (!settings.Value.Enabled) return;
        using var readScope = scopes.CreateScope();
        var readDb = readScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = clock.GetUtcNow().UtcDateTime;
        var ids = await readDb.WelcomeEmailDeliveries.AsNoTracking()
            .Where(x => x.Status == WelcomeEmailStatus.Pending && x.NextAttemptAt <= now ||
                x.Status == WelcomeEmailStatus.Processing && (x.LeaseExpiresAt == null || x.LeaseExpiresAt <= now))
            .OrderBy(x => x.NextAttemptAt).Select(x => x.Id).Take(100).ToListAsync(ct);
        foreach (var id in ids)
        {
            ct.ThrowIfCancellationRequested();
            try { await DispatchOneAsync(id, ct); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch { logger.LogWarning("Could not dispatch welcome email {EmailMessageId}; durable intent remains available for recovery", id); }
        }
        // Terminal records only. Removing an old message makes a retried old job a safe no-op.
        var cutoff = now.AddDays(-settings.Value.RetentionDays);
        await readDb.WelcomeEmailDeliveries.Where(x =>
            (x.Status == WelcomeEmailStatus.Sent || x.Status == WelcomeEmailStatus.Skipped) && x.UpdatedAt < cutoff).ExecuteDeleteAsync(ct);
        // Keep failed tombstones/attempt caps for diagnosis without retaining recipient PII forever.
        await readDb.WelcomeEmailDeliveries.Where(x => x.Status == WelcomeEmailStatus.Failed && x.UpdatedAt < cutoff && x.RecipientEmail != "")
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.RecipientEmail, ""), ct);
    }

    private async Task DispatchOneAsync(Guid id, CancellationToken ct)
    {
        using var strategyScope = scopes.CreateScope();
        var strategyDb = strategyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await strategyDb.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var item = await db.WelcomeEmailDeliveries.FromSqlInterpolated(
                $"SELECT * FROM \"WelcomeEmailDeliveries\" WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct);
            var now = clock.GetUtcNow().UtcDateTime;
            if (item is null || item.Status is WelcomeEmailStatus.Sent or WelcomeEmailStatus.Skipped or WelcomeEmailStatus.Failed ||
                item.Status == WelcomeEmailStatus.Processing && item.LeaseExpiresAt > now || item.NextAttemptAt > now) return;
            if (item.Status == WelcomeEmailStatus.Pending && item.HangfireJobId is not null)
            {
                using var connection = storage.GetConnection();
                var state = connection.GetJobData(item.HangfireJobId)?.State;
                if (state is "Enqueued" or "Processing" or "Scheduled") return;
            }
            // Short DB lock covers enqueue bookkeeping, never SMTP I/O. Unknown commit can enqueue a
            // duplicate job, but the delivery claim and terminal status still fence its side effects.
            item.HangfireJobId = jobs.Enqueue<WelcomeEmailJob>(job => job.SendAsync(id, CancellationToken.None));
            item.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            logger.LogInformation("Dispatched welcome email {EmailMessageId} as job {JobId}", id, item.HangfireJobId);
        });
    }
}
