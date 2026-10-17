using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services;

/// <summary>
/// Permanently removes recipes that have been soft-deleted for more than 30 days.
/// UpdatedAt is the deletion timestamp because the current model does not yet
/// have a dedicated DeletedAt column; the soft-delete path always updates it.
/// </summary>
public sealed class PurgeDeletedRecipesJob(
    ApplicationDbContext db,
    IFileStorageService storage,
    ILogger<PurgeDeletedRecipesJob> logger)
{
    private const int BatchSize = 100;
    private static readonly TimeSpan RetentionPeriod = TimeSpan.FromDays(30);

    [DisableConcurrentExecution(timeoutInSeconds: 3600)]
    [AutomaticRetry(Attempts = 3, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var cutoff = DateTime.UtcNow.Subtract(RetentionPeriod);
        var recipes = await db.Recipes
            .IgnoreQueryFilters()
            .Include(recipe => recipe.Images)
            .Where(recipe => recipe.IsDeleted
                && recipe.UpdatedAt.HasValue
                && recipe.UpdatedAt.Value <= cutoff)
            .OrderBy(recipe => recipe.UpdatedAt)
            .Take(BatchSize)
            .ToListAsync(cancellationToken);

        List<Exception>? failures = null;
        foreach (var recipe in recipes)
        {
            try
            {
                var urls = recipe.Images
                    .SelectMany(image => new[] { image.OriginalUrl, image.MediumUrl, image.ThumbnailUrl })
                    .Where(url => !string.IsNullOrWhiteSpace(url))
                    .Distinct(StringComparer.Ordinal)
                    .ToArray();

                foreach (var url in urls)
                {
                    await storage.DeleteAsync(url!, cancellationToken);
                }

                db.Recipes.Remove(recipe);
                await db.SaveChangesAsync(cancellationToken);

                logger.LogInformation(
                    "Purged soft-deleted recipe {RecipeId} and {ImageCount} image records",
                    recipe.Id,
                    recipe.Images.Count);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                failures ??= [];
                failures.Add(exception);
                logger.LogError(
                    exception,
                    "Could not purge soft-deleted recipe {RecipeId}; it will be retried",
                    recipe.Id);
            }
        }

        if (failures is not null)
        {
            throw new AggregateException("One or more deleted recipes could not be purged.", failures);
        }

        if (recipes.Count > 0)
        {
            logger.LogInformation("Purged {RecipeCount} soft-deleted recipes", recipes.Count);
        }
    }
}
