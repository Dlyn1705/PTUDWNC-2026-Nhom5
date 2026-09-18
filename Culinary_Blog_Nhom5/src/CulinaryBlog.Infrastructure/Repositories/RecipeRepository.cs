using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Interfaces;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.Infrastructure.Repositories;

public class RecipeRepository : Repository<Recipe>, IRecipeRepository
{
    public RecipeRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<Recipe?> GetBySlugAsync(string slug, CancellationToken ct = default)
    {
        return await _dbSet
            .Include(r => r.Category)
            .Include(r => r.Author)
            .Include(r => r.Steps.OrderBy(s => s.StepNumber))
            .Include(r => r.Ingredients.OrderBy(i => i.OrderIndex))
            .Include(r => r.Images.OrderBy(img => img.OrderIndex))
            .FirstOrDefaultAsync(r => r.Slug == slug, ct);
    }

    public async Task<Recipe?> GetDetailsByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _dbSet
            .Include(r => r.Category)
            .Include(r => r.Author)
            .Include(r => r.Steps.OrderBy(s => s.StepNumber))
            .Include(r => r.Ingredients.OrderBy(i => i.OrderIndex))
            .Include(r => r.Images.OrderBy(img => img.OrderIndex))
            .FirstOrDefaultAsync(r => r.Id == id, ct);
    }

    public async Task<bool> ExistsBySlugAsync(string slug, CancellationToken ct = default)
    {
        return await _dbSet.AnyAsync(r => r.Slug == slug, ct);
    }

    public async Task<int> CountByCategoryIdAsync(Guid categoryId, CancellationToken ct = default)
    {
        return await _dbSet.CountAsync(r => r.CategoryId == categoryId, ct);
    }

    public async Task<(IReadOnlyList<Recipe> Items, int TotalCount)> GetPagedAsync(
        int page,
        int pageSize,
        Guid? categoryId = null,
        RecipeDifficulty? difficulty = null,
        int? maxCookTime = null,
        string? sortBy = null,
        string? authorId = null,
        bool includeDrafts = false,
        CancellationToken ct = default)
    {
        var query = _dbSet
            .Include(r => r.Category)
            .Include(r => r.Author)
            .Include(r => r.Images.Where(img => img.IsPrimary))
            .AsNoTracking();

        // Lọc trạng thái hiển thị
        if (!includeDrafts)
        {
            query = query.Where(r => r.Status == RecipeStatus.Published);
        }
        else if (!string.IsNullOrEmpty(authorId))
        {
            query = query.Where(r => r.Status == RecipeStatus.Published || (r.AuthorId == authorId));
        }

        // Lọc theo Category
        if (categoryId.HasValue)
        {
            query = query.Where(r => r.CategoryId == categoryId.Value);
        }

        // Lọc theo Difficulty
        if (difficulty.HasValue)
        {
            query = query.Where(r => r.Difficulty == difficulty.Value);
        }

        // Lọc theo CookTime tối đa
        if (maxCookTime.HasValue)
        {
            query = query.Where(r => r.CookTime <= maxCookTime.Value);
        }

        // Sắp xếp
        query = sortBy?.ToLowerInvariant() switch
        {
            "title" => query.OrderBy(r => r.Title),
            "-title" => query.OrderByDescending(r => r.Title),
            "cooktime" => query.OrderBy(r => r.CookTime),
            "-cooktime" => query.OrderByDescending(r => r.CookTime),
            "createdat" => query.OrderBy(r => r.CreatedAt),
            _ => query.OrderByDescending(r => r.CreatedAt) // Mặc định: -createdAt
        };

        int totalCount = await query.CountAsync(ct);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return (items, totalCount);
    }
}
