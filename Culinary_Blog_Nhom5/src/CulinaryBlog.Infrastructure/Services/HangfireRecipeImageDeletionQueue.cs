using System;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using Hangfire;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class HangfireRecipeImageDeletionQueue(IBackgroundJobClient jobs) : IRecipeImageDeletionQueue
{
    public Task EnqueueAsync(Guid imageId, CancellationToken cancellationToken = default)
    {
        jobs.Enqueue<RecipeImageDeletionJob>(job => job.DeleteAsync(imageId, CancellationToken.None));
        return Task.CompletedTask;
    }
}
