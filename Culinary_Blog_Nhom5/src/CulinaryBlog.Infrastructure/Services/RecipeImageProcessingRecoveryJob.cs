using CulinaryBlog.Infrastructure.Persistence;
using Hangfire;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.Infrastructure.Services;

/// <summary>Recovers uploads committed before enqueue failed or the API process stopped.</summary>
public sealed class RecipeImageProcessingRecoveryJob(ApplicationDbContext db, IBackgroundJobClient jobs)
{
    [DisableConcurrentExecution(300)]
    public async Task EnqueuePendingAsync(CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddMinutes(-5);
        var ids = await db.RecipeImages.AsNoTracking()
            .Where(x => x.ProcessingStatus == "Pending" && x.CreatedAt < cutoff && !x.Recipe.IsDeleted)
            .OrderBy(x => x.CreatedAt).Select(x => x.Id).Take(100).ToListAsync(ct);
        foreach (var id in ids)
            jobs.Enqueue<RecipeImageProcessingJob>(job => job.ProcessAsync(id, CancellationToken.None));
    }
}
