using CulinaryBlog.Infrastructure.Services.Jobs;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Services.Images;
using Hangfire;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class HangfireRecipeImageProcessingQueue(IBackgroundJobClient jobs, ApplicationDbContext db) : IRecipeImageProcessingQueue
{
    public async Task EnqueueAsync(Guid imageId, CancellationToken cancellationToken = default)
    {
        var jobId = jobs.Enqueue<RecipeImageProcessingJob>(job => job.ProcessAsync(imageId, CancellationToken.None));
        await db.RecipeImageWork.Where(x => x.ImageId == imageId && x.Status == "Pending")
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.HangfireJobId, jobId), cancellationToken);
    }
}

// Keep this public type/method compatible with jobs already persisted in Hangfire.
public sealed class RecipeImageProcessingJob(ImageProcessingPipeline pipeline)
{
    [DisableConcurrentExecution(300)]
    [AutomaticRetry(Attempts = BackgroundJobRetryPolicy.RetryCount, DelaysInSeconds = new[] { BackgroundJobRetryPolicy.FirstDelaySeconds, BackgroundJobRetryPolicy.SecondDelaySeconds, BackgroundJobRetryPolicy.ThirdDelaySeconds }, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task ProcessAsync(Guid imageId, CancellationToken cancellationToken)
    {
        try { await pipeline.ProcessAsync(imageId, cancellationToken); }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw new OperationCanceledException(cancellationToken); }
        catch (ImageProcessingException) { throw; }
        catch { throw new ImageProcessingException(); }
    }
}
