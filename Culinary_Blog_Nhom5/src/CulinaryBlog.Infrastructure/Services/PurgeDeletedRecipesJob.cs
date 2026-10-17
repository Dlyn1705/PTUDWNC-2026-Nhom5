using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using CulinaryBlog.Infrastructure.Services.Images;

namespace CulinaryBlog.Infrastructure.Services;

/// <summary>
/// Permanently removes recipes that have been soft-deleted for more than 30 days.
/// UpdatedAt is the deletion timestamp because the current model does not yet
/// have a dedicated DeletedAt column; the soft-delete path always updates it.
/// </summary>
public sealed class PurgeDeletedRecipesJob(
    IServiceScopeFactory scopes,
    ILogger<PurgeDeletedRecipesJob> logger)
{
    private const int BatchSize = 100;
    private static readonly TimeSpan RetentionPeriod = TimeSpan.FromDays(30);

    [DisableConcurrentExecution(timeoutInSeconds: 3600)]
    [AutomaticRetry(Attempts = 3, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var cutoff = DateTime.UtcNow.Subtract(RetentionPeriod);
        List<Exception>? failures = null;
        var failedIds = new List<Guid>();
        var purgedCount = 0;
        while (true)
        {
            using var batchScope = scopes.CreateScope();
            var batchDb = batchScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var ids = await batchDb.Recipes.IgnoreQueryFilters().AsNoTracking()
                .Where(recipe => recipe.IsDeleted && recipe.UpdatedAt < cutoff
                    && !failedIds.Contains(recipe.Id))
                .OrderBy(recipe => recipe.UpdatedAt).ThenBy(recipe => recipe.Id)
                .Select(recipe => recipe.Id).Take(BatchSize).ToListAsync(cancellationToken);
            if (ids.Count == 0) break;

            foreach (var id in ids)
            {
                try
                {
                    // Isolate each record and every retry. A failed SaveChanges must
                    // never leave a pending DELETE in the next record's tracker.
                    var removed = await batchDb.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
                    {
                        using var attempt = scopes.CreateScope();
                        var db = attempt.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                        var locks = attempt.ServiceProvider.GetRequiredService<ImageWorkLock>();
                        var cleanup = attempt.ServiceProvider.GetRequiredService<ImageGenerationCleanup>();
                        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
                        var recipe = await db.Recipes.FromSqlInterpolated(
                            $"SELECT * FROM \"Recipes\" WHERE \"Id\" = {id} FOR UPDATE")
                            .IgnoreQueryFilters().SingleOrDefaultAsync(cancellationToken);
                        if (recipe is null || !recipe.IsDeleted || recipe.UpdatedAt is null || recipe.UpdatedAt >= cutoff)
                            return false;
                        var images = await db.RecipeImages.IgnoreQueryFilters()
                            .Where(image => image.RecipeId == id).ToListAsync(cancellationToken);
                        await using var held = await locks.TryAcquireManyAsync(images.Select(image => image.Id), cancellationToken)
                            ?? throw new InvalidOperationException("Image is still processing; purge will retry.");
                        foreach (var image in images.OrderBy(image => image.Id))
                            await cleanup.DeleteImageObjectsAsync(image.Id, cancellationToken);

                        db.Recipes.Remove(recipe);
                        await db.SaveChangesAsync(cancellationToken);
                        await transaction.CommitAsync(cancellationToken);
                        return true;
                    });
                    if (removed) purgedCount++;
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    failures ??= [];
                    failures.Add(exception);
                    failedIds.Add(id);
                    logger.LogError(
                        exception,
                        "Could not purge soft-deleted recipe {RecipeId}; it will be retried",
                        id);
                }
            }
        }

        if (failures is not null)
        {
            throw new AggregateException("One or more deleted recipes could not be purged.", failures);
        }

        if (purgedCount > 0)
        {
            logger.LogInformation("Purged {RecipeCount} soft-deleted recipes", purgedCount);
        }
    }
}
