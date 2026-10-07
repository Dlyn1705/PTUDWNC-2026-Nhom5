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

    // ============================================================
    // GET RECIPE BY SLUG
    // ============================================================
    public async Task<Recipe?> GetBySlugAsync(
        string slug,
        CancellationToken ct = default)
    {
        return await _dbSet
            .Include(r => r.Category)
            .Include(r => r.Author)
            .Include(r => r.Steps.OrderBy(s => s.StepNumber))
            .Include(r => r.Ingredients.OrderBy(i => i.OrderIndex))
            .Include(r => r.Images.OrderBy(img => img.OrderIndex))
            .FirstOrDefaultAsync(
                r => r.Slug == slug && !r.IsDeleted,
                ct);
    }

    // ============================================================
    // GET RECIPE DETAILS BY ID
    // ============================================================
    public async Task<Recipe?> GetDetailsByIdAsync(
        Guid id,
        CancellationToken ct = default)
    {
        return await _dbSet
            .Include(r => r.Category)
            .Include(r => r.Author)
            .Include(r => r.Steps.OrderBy(s => s.StepNumber))
            .Include(r => r.Ingredients.OrderBy(i => i.OrderIndex))
            .Include(r => r.Images.OrderBy(img => img.OrderIndex))
            .FirstOrDefaultAsync(
                r => r.Id == id && !r.IsDeleted,
                ct);
    }

    // ============================================================
    // CHECK SLUG EXISTS
    // ============================================================
    public async Task<bool> ExistsBySlugAsync(
        string slug,
        CancellationToken ct = default)
    {
        return await _dbSet
            .AnyAsync(
                r => r.Slug == slug && !r.IsDeleted,
                ct);
    }

    // ============================================================
    // COUNT RECIPES BY CATEGORY
    // ============================================================
    public async Task<int> CountByCategoryIdAsync(
        Guid categoryId,
        CancellationToken ct = default)
    {
        return await _dbSet
            .CountAsync(
                r => r.CategoryId == categoryId &&
                     !r.IsDeleted,
                ct);
    }

    // ============================================================
    // SEARCH RECIPES (FR-SRCH-001 - PostgreSQL Full-Text Search)
    // ============================================================
    public async Task<(IReadOnlyList<Recipe> Items, int TotalCount, IReadOnlyDictionary<Guid, double> RelevanceScores)> SearchRecipesAsync(
        string sanitizedTsQuery,
        int page,
        int pageSize,
        Guid? categoryId = null,
        RecipeDifficulty? difficulty = null,
        int? minCookTime = null,
        int? maxCookTime = null,
        int? minServings = null,
        int? maxServings = null,
        string? sortBy = null,
        string? sortOrder = null,
        CancellationToken ct = default)
    {
        var query = _dbSet
            .AsNoTracking()
            .Include(r => r.Category)
            .Include(r => r.Author)
            .Include(r => r.Images)
            .Where(r => r.Status == RecipeStatus.Published && !r.IsDeleted);

        if (categoryId.HasValue)
        {
            query = query.Where(r => r.CategoryId == categoryId.Value);
        }

        if (difficulty.HasValue)
        {
            query = query.Where(r => r.Difficulty == difficulty.Value);
        }

        if (minCookTime.HasValue)
        {
            query = query.Where(r => r.CookTime >= minCookTime.Value);
        }

        if (maxCookTime.HasValue)
        {
            query = query.Where(r => r.CookTime <= maxCookTime.Value);
        }

        if (minServings.HasValue)
        {
            query = query.Where(r => r.Servings >= minServings.Value);
        }

        if (maxServings.HasValue)
        {
            query = query.Where(r => r.Servings <= maxServings.Value);
        }

        query = query.Where(r =>
            r.SearchVector != null &&
            r.SearchVector.Matches(
                EF.Functions.ToTsQuery("simple", sanitizedTsQuery)));
        var rankedQuery = query.Select(r => new
        {
            Recipe = r,
            Score = r.SearchVector!.Rank(
                EF.Functions.ToTsQuery("simple", sanitizedTsQuery))
        });

        var descending = !string.Equals(sortOrder, "asc", StringComparison.OrdinalIgnoreCase);
        rankedQuery = sortBy?.ToLowerInvariant() switch
        {
            "title" when descending => rankedQuery.OrderByDescending(x => x.Recipe.Title).ThenByDescending(x => x.Recipe.CreatedAt).ThenByDescending(x => x.Recipe.Id),
            "title" => rankedQuery.OrderBy(x => x.Recipe.Title).ThenByDescending(x => x.Recipe.CreatedAt).ThenByDescending(x => x.Recipe.Id),
            "cooktime" when descending => rankedQuery.OrderByDescending(x => x.Recipe.CookTime).ThenByDescending(x => x.Recipe.CreatedAt).ThenByDescending(x => x.Recipe.Id),
            "cooktime" => rankedQuery.OrderBy(x => x.Recipe.CookTime).ThenByDescending(x => x.Recipe.CreatedAt).ThenByDescending(x => x.Recipe.Id),
            "createdat" when descending => rankedQuery.OrderByDescending(x => x.Recipe.CreatedAt).ThenByDescending(x => x.Recipe.Id),
            "createdat" => rankedQuery.OrderBy(x => x.Recipe.CreatedAt).ThenBy(x => x.Recipe.Id),
            "relevance" => rankedQuery.OrderByDescending(x => x.Score).ThenByDescending(x => x.Recipe.CreatedAt).ThenByDescending(x => x.Recipe.Id),
            _ => rankedQuery.OrderByDescending(x => x.Score).ThenByDescending(x => x.Recipe.CreatedAt).ThenByDescending(x => x.Recipe.Id)
        };

        var totalCount = await rankedQuery.CountAsync(ct);
        var pageItems = await rankedQuery
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        var items = pageItems.Select(x => x.Recipe).ToList();
        var scores = pageItems.ToDictionary(x => x.Recipe.Id, x => (double)x.Score);
        return (items, totalCount, scores);
    }

    // ============================================================
    // GET PAGED RECIPES (FR-RCP-001)
    // ============================================================
    public async Task<(IReadOnlyList<Recipe> Items, int TotalCount)> GetPagedAsync(
        int page,
        int pageSize,
        Guid? categoryId = null,
        RecipeDifficulty? difficulty = null,
        int? maxCookTime = null,
        string? sortBy = null,
        string? authorId = null,
        bool includeDrafts = false,
        RecipeStatus? status = null,
        CancellationToken ct = default)
    {
        var query = _dbSet
            .Include(r => r.Category)
            .Include(r => r.Author)
            .Include(r => r.Images.Where(img => img.IsPrimary))
            .AsNoTracking()
            .Where(r => !r.IsDeleted);

        // Lọc trạng thái hiển thị
        if (includeDrafts)
        {
            if (!string.IsNullOrEmpty(authorId))
            {
                query = query.Where(r => r.AuthorId == authorId);
            }
        }
        else
        {
            query = query.Where(r => r.Status == RecipeStatus.Published);
        }

        if (status.HasValue)
        {
            query = query.Where(r => r.Status == status.Value);
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
            "-createdat" => query.OrderByDescending(r => r.CreatedAt),
            _ => query.OrderByDescending(r => r.CreatedAt)
        };

        var totalCount = await query.CountAsync(ct);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return (items, totalCount);
    }
}
