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

public class CategoryRepository : Repository<Category>, ICategoryRepository
{
    public CategoryRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<Category?> GetBySlugAsync(string slug, CancellationToken ct = default)
    {
        return await _dbSet.FirstOrDefaultAsync(c => c.Slug == slug, ct);
    }

    public async Task<bool> ExistsByNameAsync(string name, CancellationToken ct = default)
    {
        return await _dbSet.AnyAsync(c => c.Name.ToLower() == name.ToLower(), ct);
    }

    public async Task<bool> ExistsBySlugAsync(string slug, CancellationToken ct = default)
    {
        return await _dbSet.AnyAsync(c => c.Slug == slug, ct);
    }

    public async Task<IReadOnlyList<(Category Category, int RecipeCount)>> GetAllWithRecipeCountAsync(CancellationToken ct = default)
    {
        var query = await _dbSet
            .Select(c => new
            {
                Category = c,
                RecipeCount = c.Recipes.Count(r => r.Status == RecipeStatus.Published && !r.IsDeleted)
            })
            .ToListAsync(ct);

        return query.Select(x => (x.Category, x.RecipeCount)).ToList();
    }
}
