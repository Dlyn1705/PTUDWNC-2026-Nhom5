using System;
using System.Threading;
using System.Threading.Tasks;

namespace CulinaryBlog.Domain.Interfaces;

public interface IUnitOfWork : IDisposable
{
    ICategoryRepository Categories { get; }
    IRecipeRepository Recipes { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
