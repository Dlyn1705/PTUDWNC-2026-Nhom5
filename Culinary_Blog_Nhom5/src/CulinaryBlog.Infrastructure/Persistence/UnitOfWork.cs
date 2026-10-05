using System;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using CulinaryBlog.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.Infrastructure.Persistence;

public class UnitOfWork : IUnitOfWork
{
    private readonly ApplicationDbContext _context;
    private ICategoryRepository? _categories;
    private IRecipeRepository? _recipes;

    public UnitOfWork(ApplicationDbContext context)
    {
        _context = context;
    }

    public ICategoryRepository Categories => _categories ??= new CategoryRepository(_context);
    public IRecipeRepository Recipes => _recipes ??= new RecipeRepository(_context);

    public async Task AddRecipeImageAsync(Domain.Entities.RecipeImage image, CancellationToken ct = default)
    {
        await _context.RecipeImages.AddAsync(image, ct);
    }

    public Task<Domain.Entities.RecipeImage?> GetRecipeImageIncludingDeletedAsync(Guid imageId, CancellationToken ct = default)
    {
        return _context.RecipeImages.IgnoreQueryFilters()
            .FirstOrDefaultAsync(image => image.Id == imageId, ct);
    }

    public async Task SoftDeleteRecipeImageAsync(
        Domain.Entities.RecipeImage image,
        Domain.Entities.RecipeImage? replacementPrimary,
        CancellationToken ct = default)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(ct);
        image.IsPrimary = false;
        image.IsDeleted = true;
        await SaveChangesAsync(ct);

        if (replacementPrimary is not null)
        {
            replacementPrimary.IsPrimary = true;
            await SaveChangesAsync(ct);
        }

        await transaction.CommitAsync(ct);
    }

    public void RemoveRecipeImage(Domain.Entities.RecipeImage image)
    {
        _context.RecipeImages.Remove(image);
    }

    public async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        try
        {
            return await _context.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("Dữ liệu đã bị thay đổi bởi người dùng khác. Vui lòng tải lại và thử lại.");
        }
    }

    public void Dispose()
    {
        _context.Dispose();
        GC.SuppressFinalize(this);
    }
}
