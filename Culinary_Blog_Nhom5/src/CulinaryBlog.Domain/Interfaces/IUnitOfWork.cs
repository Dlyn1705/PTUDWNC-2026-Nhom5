using System;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Domain.Entities;

namespace CulinaryBlog.Domain.Interfaces;

public interface IUnitOfWork : IDisposable
{
    ICategoryRepository Categories { get; }
    IRecipeRepository Recipes { get; }
    Task AddRecipeImageAsync(RecipeImage image, CancellationToken ct = default);
    void RemoveRecipeImage(RecipeImage image);
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}
