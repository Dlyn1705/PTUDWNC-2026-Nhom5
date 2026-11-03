using CulinaryBlog.Application.Contracts;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class HangfireRecipeImageDeletionQueue(RecipeImageDeletionRecoveryJob dispatcher) : IRecipeImageDeletionQueue
{
    public Task EnqueueAsync(Guid imageId, CancellationToken cancellationToken = default) =>
        dispatcher.DispatchOneAsync(imageId, cancellationToken);
}
