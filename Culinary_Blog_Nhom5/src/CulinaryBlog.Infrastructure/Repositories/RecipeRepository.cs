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
    // SEARCH RECIPES
    // FR-SRCH-001
    //
    // Không dùng ToTsQuery để tránh lỗi EF Core client evaluation.
    // Dùng PostgreSQL ILIKE.
    // ============================================================
    public async Task<(IReadOnlyList<Recipe> Items, int TotalCount)>
        SearchRecipesAsync(
            string sanitizedTsQuery,
            int page,
            int pageSize,
            Guid? categoryId = null,
            RecipeDifficulty? difficulty = null,
            string? sortBy = null,
            CancellationToken ct = default)
    {
        var query = _dbSet
            .AsNoTracking()
            .Include(r => r.Category)
            .Include(r => r.Author)
            .Include(r => r.Images)
            .Where(r =>
                r.Status == RecipeStatus.Published &&
                !r.IsDeleted);

        // --------------------------------------------------------
        // SEARCH KEYWORD
        // --------------------------------------------------------
        if (!string.IsNullOrWhiteSpace(sanitizedTsQuery))
        {
            var keyword = sanitizedTsQuery.Trim();

            query = query.Where(r =>
                EF.Functions.ILike(
                    r.Title,
                    $"%{keyword}%")

                ||

                EF.Functions.ILike(
                    r.Description,
                    $"%{keyword}%")

                ||

                EF.Functions.ILike(
                    r.Instructions,
                    $"%{keyword}%"));
        }

        // --------------------------------------------------------
        // CATEGORY FILTER
        // --------------------------------------------------------
        if (categoryId.HasValue)
        {
            query = query.Where(
                r => r.CategoryId == categoryId.Value);
        }

        // --------------------------------------------------------
        // DIFFICULTY FILTER
        // --------------------------------------------------------
        if (difficulty.HasValue)
        {
            query = query.Where(
                r => r.Difficulty == difficulty.Value);
        }

        // --------------------------------------------------------
        // SORT
        // --------------------------------------------------------
        query = sortBy?.ToLowerInvariant() switch
        {
            "title" =>
                query.OrderBy(r => r.Title),

            "-title" =>
                query.OrderByDescending(r => r.Title),

            "cooktime" =>
                query.OrderBy(r => r.CookTime),

            "-cooktime" =>
                query.OrderByDescending(r => r.CookTime),

            "createdat" =>
                query.OrderBy(r => r.CreatedAt),

            "-createdat" =>
                query.OrderByDescending(r => r.CreatedAt),

            _ =>
                query.OrderByDescending(r => r.CreatedAt)
        };

        // --------------------------------------------------------
        // COUNT
        // --------------------------------------------------------
        var totalCount =
            await query.CountAsync(ct);

        // --------------------------------------------------------
        // PAGINATION
        // --------------------------------------------------------
        var items =
            await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync(ct);

        return (items, totalCount);
    }

    // ============================================================
    // GET PAGED RECIPES
    // FR-RCP-001
    // ============================================================
    public async Task<(IReadOnlyList<Recipe> Items, int TotalCount)>
        GetPagedAsync(
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
            .Include(r =>
                r.Images.Where(img => img.IsPrimary))
            .AsNoTracking()
            .Where(r => !r.IsDeleted);

        // --------------------------------------------------------
        // STATUS
        // --------------------------------------------------------
        if (!includeDrafts)
        {
            query = query.Where(
                r => r.Status == RecipeStatus.Published);
        }
        else if (!string.IsNullOrWhiteSpace(authorId))
        {
            query = query.Where(
                r =>
                    r.Status == RecipeStatus.Published
                    ||
                    r.AuthorId == authorId);
        }

        // --------------------------------------------------------
        // CATEGORY
        // --------------------------------------------------------
        if (categoryId.HasValue)
        {
            query = query.Where(
                r => r.CategoryId == categoryId.Value);
        }

        // --------------------------------------------------------
        // DIFFICULTY
        // --------------------------------------------------------
        if (difficulty.HasValue)
        {
            query = query.Where(
                r => r.Difficulty == difficulty.Value);
        }

        // --------------------------------------------------------
        // MAX COOK TIME
        // --------------------------------------------------------
        if (maxCookTime.HasValue)
        {
            query = query.Where(
                r => r.CookTime <= maxCookTime.Value);
        }

        // --------------------------------------------------------
        // SORT
        // --------------------------------------------------------
        query = sortBy?.ToLowerInvariant() switch
        {
            "title" =>
                query.OrderBy(r => r.Title),

            "-title" =>
                query.OrderByDescending(r => r.Title),

            "cooktime" =>
                query.OrderBy(r => r.CookTime),

            "-cooktime" =>
                query.OrderByDescending(r => r.CookTime),

            "createdat" =>
                query.OrderBy(r => r.CreatedAt),

            "-createdat" =>
                query.OrderByDescending(r => r.CreatedAt),

            _ =>
                query.OrderByDescending(r => r.CreatedAt)
        };

        // --------------------------------------------------------
        // COUNT
        // --------------------------------------------------------
        var totalCount =
            await query.CountAsync(ct);

        // --------------------------------------------------------
        // PAGINATION
        // --------------------------------------------------------
        var items =
            await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync(ct);

        return (items, totalCount);
    }
}