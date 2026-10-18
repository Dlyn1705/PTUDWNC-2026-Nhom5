using CulinaryBlog.Application.Features.Recipes.Commands.CreateRecipe;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class RecipeCreationStore(IServiceScopeFactory scopes) : IRecipeCreationStore
{
    public async Task<CreatedRecipe> CreateAsync(Recipe recipe, CancellationToken cancellationToken)
    {
        var baseSlug = recipe.Slug;
        await using var strategyScope = scopes.CreateAsyncScope();
        var strategy = strategyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>()
            .Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            // A fresh context is essential after a failed transaction or a commit acknowledgement retry.
            for (var attempt = 0; attempt < 16; attempt++)
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var existing = await db.Recipes.IgnoreQueryFilters().AsNoTracking()
                    .SingleOrDefaultAsync(x => x.Id == recipe.Id, cancellationToken);
                if (existing is not null) return Result(existing);
                await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
                var author = await db.Users.FromSqlInterpolated(
                    $"SELECT * FROM \"AspNetUsers\" WHERE \"Id\" = {recipe.AuthorId} FOR SHARE")
                    .AsNoTracking().SingleOrDefaultAsync(cancellationToken);
                if (author is null || !author.IsActive) throw new ForbiddenException("Tài khoản không còn hoạt động.");
                var category = await db.Categories.FromSqlInterpolated(
                    $"SELECT * FROM \"Categories\" WHERE \"Id\" = {recipe.CategoryId} FOR SHARE")
                    .AsNoTracking().SingleOrDefaultAsync(cancellationToken);
                if (category is null) throw new NotFoundException("Category", recipe.CategoryId);

                // Serialize creations with the same base slug; the unique index also protects other writers.
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"SELECT pg_advisory_xact_lock(hashtext({baseSlug}))", cancellationToken);
                var suffix = 1;
                recipe.Slug = baseSlug;
                while (await db.Recipes.AnyAsync(x => x.Slug == recipe.Slug, cancellationToken))
                    recipe.Slug = $"{baseSlug}-{++suffix}";
                db.Recipes.Add(recipe);
                try
                {
                    await db.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                    return Result(recipe);
                }
                catch (DbUpdateException ex) when (ex.InnerException is PostgresException
                    { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "IX_Recipes_Slug" })
                {
                    // A legacy update/create writer may not take the advisory lock. Retry from a fresh snapshot.
                }
            }
            throw new ConflictException("Chưa thể cấp slug cho công thức. Vui lòng thử lại.");
        });
    }

    private static CreatedRecipe Result(Recipe recipe) => new("Tạo công thức thành công.", recipe.Id,
        recipe.Slug, Convert.ToBase64String(recipe.RowVersion));
}
