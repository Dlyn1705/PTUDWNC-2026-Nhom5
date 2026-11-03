using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Services.Jobs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CulinaryBlog.Infrastructure.Services.Images;

public sealed record ImageDeletionClaim(Guid ImageId, Guid RecipeId, Guid Token, int Attempt);

public sealed class ImageDeletionStore(IServiceScopeFactory scopes, TimeProvider clock)
{
    public async Task EnsureAsync(Guid imageId, Guid recipeId, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = clock.GetUtcNow().UtcDateTime;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "RecipeImageDeletionWork" ("ImageId", "RecipeId", "Status", "AttemptCount", "NextAttemptAt", "UpdatedAt")
            VALUES ({imageId}, {recipeId}, 'Pending', 0, {now}, {now}) ON CONFLICT DO NOTHING
            """, ct);
    }

    public async Task<ImageDeletionClaim?> ClaimAsync(Guid imageId, CancellationToken ct)
    {
        using var outer = scopes.CreateScope();
        var strategyDb = outer.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await strategyDb.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var work = await db.RecipeImageDeletionWork.FromSqlInterpolated(
                $"SELECT * FROM \"RecipeImageDeletionWork\" WHERE \"ImageId\" = {imageId} FOR UPDATE").SingleOrDefaultAsync(ct);
            var now = clock.GetUtcNow().UtcDateTime;
            if (work is null || work.Status is "Completed" or "Failed" or "Skipped" || work.NextAttemptAt > now ||
                work.Status == "Processing" && work.LeaseExpiresAt > now) return null;
            if (work.AttemptCount >= BackgroundJobRetryPolicy.MaximumAttempts)
            {
                work.Status = "Failed"; work.LastErrorCode = "AttemptsExhausted";
                await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return null;
            }
            work.Status = "Processing"; work.AttemptCount++; work.LeaseToken = Guid.NewGuid();
            work.LeaseExpiresAt = now.AddMinutes(3); work.UpdatedAt = now;
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return new ImageDeletionClaim(imageId, work.RecipeId, work.LeaseToken.Value, work.AttemptCount);
        });
    }

    public async Task FailAsync(ImageDeletionClaim claim, string errorCode, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var now = clock.GetUtcNow().UtcDateTime;
        var status = claim.Attempt >= BackgroundJobRetryPolicy.MaximumAttempts ? "Failed" : "Pending";
        var next = now.AddSeconds(BackgroundJobRetryPolicy.DelayAfter(claim.Attempt));
        await db.RecipeImageDeletionWork.Where(x => x.ImageId == claim.ImageId && x.LeaseToken == claim.Token && x.Status == "Processing")
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.Status, status).SetProperty(x => x.NextAttemptAt, next)
                .SetProperty(x => x.LeaseToken, (Guid?)null).SetProperty(x => x.LeaseExpiresAt, (DateTime?)null)
                .SetProperty(x => x.LastErrorCode, errorCode).SetProperty(x => x.UpdatedAt, now), ct);
    }

    public async Task DeferRetentionAsync(ImageDeletionClaim claim, DateTime until, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.RecipeImageDeletionWork.Where(x => x.ImageId == claim.ImageId && x.LeaseToken == claim.Token && x.Status == "Processing")
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.Status, "Pending").SetProperty(x => x.NextAttemptAt, until)
                .SetProperty(x => x.AttemptCount, x => x.AttemptCount - 1)
                .SetProperty(x => x.LeaseToken, (Guid?)null).SetProperty(x => x.LeaseExpiresAt, (DateTime?)null)
                .SetProperty(x => x.LastErrorCode, "RecipeRetention"), ct);
    }
}
