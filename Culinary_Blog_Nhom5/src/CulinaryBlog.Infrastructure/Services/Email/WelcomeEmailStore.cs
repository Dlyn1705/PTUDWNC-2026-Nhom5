using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CulinaryBlog.Infrastructure.Services.Email;

public sealed record WelcomeEmailClaim(Guid Id, Guid LeaseToken, string UserId, string RecipientEmail, string DisplayName, int Attempt);

public sealed class WelcomeEmailStore(IServiceScopeFactory scopes, IOptions<WelcomeEmailOptions> settings, TimeProvider clock)
{
    public static readonly int[] RetryDelays = [60, 300, 900];
    public const int MaximumAttempts = 4;

    public async Task<WelcomeEmailClaim?> ClaimAsync(Guid id, CancellationToken ct)
    {
        if (!settings.Value.Enabled) return null;
        using var outer = scopes.CreateScope();
        var strategyDb = outer.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await strategyDb.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var delivery = await db.WelcomeEmailDeliveries.FromSqlInterpolated(
                $"SELECT * FROM \"WelcomeEmailDeliveries\" WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct);
            var now = clock.GetUtcNow().UtcDateTime;
            if (delivery is null || delivery.Status is WelcomeEmailStatus.Sent or WelcomeEmailStatus.Failed or WelcomeEmailStatus.Skipped ||
                delivery.Status == WelcomeEmailStatus.Processing && delivery.LeaseExpiresAt > now || delivery.NextAttemptAt > now) return null;
            var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == delivery.UserId, ct);
            if (user is null || !user.IsActive || !string.Equals(user.Email, delivery.RecipientEmail, StringComparison.OrdinalIgnoreCase))
            {
                delivery.Status = WelcomeEmailStatus.Skipped;
                delivery.LastErrorCode = user is null || !user.IsActive ? "AccountUnavailable" : "RecipientChanged";
                delivery.LeaseToken = null; delivery.LeaseExpiresAt = null; delivery.UpdatedAt = now;
                await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return null;
            }
            if (delivery.AttemptCount >= MaximumAttempts)
            {
                delivery.Status = WelcomeEmailStatus.Failed; delivery.LastErrorCode = "AttemptsExhausted";
                delivery.LeaseToken = null; delivery.LeaseExpiresAt = null; delivery.UpdatedAt = now;
                await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return null;
            }
            delivery.Status = WelcomeEmailStatus.Processing;
            delivery.AttemptCount++;
            delivery.LeaseToken = Guid.NewGuid();
            delivery.LeaseExpiresAt = now.AddSeconds(settings.Value.LeaseSeconds);
            delivery.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return new WelcomeEmailClaim(delivery.Id, delivery.LeaseToken.Value, user.Id,
                delivery.RecipientEmail, user.DisplayName, delivery.AttemptCount);
        });
    }

    public async Task CompleteAsync(WelcomeEmailClaim claim, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = clock.GetUtcNow().UtcDateTime;
        var count = await db.WelcomeEmailDeliveries.Where(x => x.Id == claim.Id && x.LeaseToken == claim.LeaseToken && x.Status == WelcomeEmailStatus.Processing)
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.Status, WelcomeEmailStatus.Sent).SetProperty(x => x.SentAt, now)
                .SetProperty(x => x.UpdatedAt, now).SetProperty(x => x.LeaseToken, (Guid?)null)
                .SetProperty(x => x.LeaseExpiresAt, (DateTime?)null).SetProperty(x => x.LastErrorCode, (string?)null), ct);
        if (count != 1) throw new InvalidOperationException("Welcome email lease was lost after transport acceptance.");
    }

    public async Task FailAsync(WelcomeEmailClaim claim, string errorCode, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = clock.GetUtcNow().UtcDateTime;
        var status = claim.Attempt >= MaximumAttempts ? WelcomeEmailStatus.Failed : WelcomeEmailStatus.Pending;
        var next = now.AddSeconds(RetryDelays[Math.Min(claim.Attempt - 1, RetryDelays.Length - 1)]);
        await db.WelcomeEmailDeliveries.Where(x => x.Id == claim.Id && x.LeaseToken == claim.LeaseToken && x.Status == WelcomeEmailStatus.Processing)
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.Status, status).SetProperty(x => x.NextAttemptAt, next)
                .SetProperty(x => x.UpdatedAt, now).SetProperty(x => x.LastErrorCode, errorCode)
                .SetProperty(x => x.LeaseToken, (Guid?)null).SetProperty(x => x.LeaseExpiresAt, (DateTime?)null), ct);
    }
}
