using System;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using CulinaryBlog.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Npgsql;

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
        try
        {
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
        catch (DbUpdateException)
        {
            throw new ConflictException(
                "Ảnh hoặc trạng thái ảnh chính vừa được thay đổi. Vui lòng tải lại và thử lại.",
                "RECIPE_IMAGE_CONFLICT");
        }
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
        catch (DbUpdateException exception)
            when (exception.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation
            } postgresException
            && postgresException.ConstraintName is
                "UX_Categories_Name_Active" or "UX_Categories_Slug_Active")
        {
            throw postgresException.ConstraintName switch
            {
                "UX_Categories_Name_Active" => new ConflictException(
                    "Tên danh mục đã tồn tại.",
                    "CATEGORY_NAME_ALREADY_EXISTS"),
                _ => new ConflictException(
                    "Slug danh mục đã tồn tại. Vui lòng thử lại.",
                    "CATEGORY_SLUG_ALREADY_EXISTS")
            };
        }
    }

    public void Dispose()
    {
        _context.Dispose();
        GC.SuppressFinalize(this);
    }
}
