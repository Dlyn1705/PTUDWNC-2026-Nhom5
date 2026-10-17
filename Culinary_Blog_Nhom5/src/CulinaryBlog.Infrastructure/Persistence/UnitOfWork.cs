using System;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using CulinaryBlog.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace CulinaryBlog.Infrastructure.Persistence;

public class UnitOfWork : IUnitOfWork
{
    private readonly ApplicationDbContext _context;
    private readonly IServiceScopeFactory _scopeFactory;
    private ICategoryRepository? _categories;
    private IRecipeRepository? _recipes;

    public UnitOfWork(ApplicationDbContext context, IServiceScopeFactory scopeFactory)
    {
        _context = context;
        _scopeFactory = scopeFactory;
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
        try
        {
            var strategy = _context.Database.CreateExecutionStrategy();
            await strategy.ExecuteAsync(async () =>
            {
                ct.ThrowIfCancellationRequested();
                using var scope = _scopeFactory.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await using var transaction = await context.Database.BeginTransactionAsync(ct);

                var imageToDelete = await context.RecipeImages.IgnoreQueryFilters()
                    .SingleAsync(candidate => candidate.Id == image.Id, ct);
                if (imageToDelete.IsDeleted)
                    return; // A previous attempt may have committed before the connection failed.

                imageToDelete.IsPrimary = false;
                imageToDelete.IsDeleted = true;
                await context.SaveChangesAsync(ct);

                if (replacementPrimary is not null)
                {
                    var replacement = await context.RecipeImages
                        .SingleAsync(candidate => candidate.Id == replacementPrimary.Id, ct);
                    replacement.IsPrimary = true;
                    await context.SaveChangesAsync(ct);
                }

                await transaction.CommitAsync(ct);
            });
            image.IsPrimary = false;
            image.IsDeleted = true;
            if (replacementPrimary is not null) replacementPrimary.IsPrimary = true;
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
                "UX_Categories_Name_Active" or "UX_Categories_Slug_Active" or "IX_Recipes_Slug")
        {
            throw postgresException.ConstraintName switch
            {
                "UX_Categories_Name_Active" => new ConflictException(
                    "Tên danh mục đã tồn tại.",
                    "CATEGORY_NAME_ALREADY_EXISTS"),
                _ => new ConflictException(
                    postgresException.ConstraintName == "IX_Recipes_Slug"
                        ? "Slug công thức đã tồn tại. Vui lòng thử lại."
                        : "Slug danh mục đã tồn tại. Vui lòng thử lại.",
                    postgresException.ConstraintName == "IX_Recipes_Slug"
                        ? "RECIPE_SLUG_ALREADY_EXISTS"
                        : "CATEGORY_SLUG_ALREADY_EXISTS")
            };
        }
    }

    public void Dispose()
    {
        _context.Dispose();
        GC.SuppressFinalize(this);
    }
}
