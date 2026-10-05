using System;
using System.Threading;
using System.Threading.Tasks;

namespace CulinaryBlog.Application.Contracts;

public interface IRecipeImageDeletionQueue
{
    Task EnqueueAsync(Guid imageId, CancellationToken cancellationToken = default);
}
