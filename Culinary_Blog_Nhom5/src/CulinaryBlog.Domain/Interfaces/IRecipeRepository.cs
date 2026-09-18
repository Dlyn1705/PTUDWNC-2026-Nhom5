using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;

namespace CulinaryBlog.Domain.Interfaces;

public interface IRecipeRepository : IRepository<Recipe>
{
    Task<Recipe?> GetBySlugAsync(string slug, CancellationToken ct = default);
    Task<Recipe?> GetDetailsByIdAsync(Guid id, CancellationToken ct = default);
    Task<bool> ExistsBySlugAsync(string slug, CancellationToken ct = default);
    Task<int> CountByCategoryIdAsync(Guid categoryId, CancellationToken ct = default);
    Task<(IReadOnlyList<Recipe> Items, int TotalCount)> GetPagedAsync(
        int page,
        int pageSize,
        Guid? categoryId = null,
        RecipeDifficulty? difficulty = null,
        int? maxCookTime = null,
        string? sortBy = null,
        string? authorId = null,
        bool includeDrafts = false,
        CancellationToken ct = default);
}
