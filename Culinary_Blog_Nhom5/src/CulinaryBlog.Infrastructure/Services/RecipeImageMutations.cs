using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeImages;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class RecipeImageMutations(
    IServiceScopeFactory scopes,
    ICurrentUserService user,
    IRecipeCacheInvalidator? cacheInvalidator = null)
    : IRecipeImageMutations
{
    public Task AddAsync(RecipeImage image, CancellationToken ct) => ExecuteAsync(image.RecipeId, async db =>
    {
        // Retrying after an ambiguous commit must not insert the same image twice.
        if (await db.RecipeImages.IgnoreQueryFilters().AnyAsync(x => x.Id == image.Id, ct)) return image;
        var recipe = await db.Recipes.SingleAsync(x => x.Id == image.RecipeId, ct);
        if (recipe.Status == RecipeStatus.Archived)
            throw new ConflictException("Không thể tải ảnh lên công thức đã lưu trữ.", "RECIPE_ARCHIVED");
        var images = await db.RecipeImages.Where(x => x.RecipeId == image.RecipeId)
            .OrderBy(x => x.OrderIndex).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(ct);
        if (images.Count > 0 && !images.Any(x => x.IsPrimary)) images[0].IsPrimary = true;
        image.IsPrimary = images.Count == 0;
        image.OrderIndex = images.Count == 0 ? 0 : checked(images.Max(x => x.OrderIndex) + 1);
        // A previous attempt may have populated this navigation through EF relationship fixup.
        // Do not attach that detached recipe graph as Added in the fresh retry context.
        image.Recipe = null!;
        db.RecipeImages.Add(image);
        await db.SaveChangesAsync(ct);
        return image;
    }, ct);

    public Task<RecipeImage> SetPrimaryAsync(Guid recipeId, Guid imageId, CancellationToken ct) =>
        ExecuteAsync(recipeId, async db =>
        {
            var images = await db.RecipeImages.Where(x => x.RecipeId == recipeId).ToListAsync(ct);
            var target = images.SingleOrDefault(x => x.Id == imageId)
                ?? throw new NotFoundException("RecipeImage", imageId);
            if (target.IsPrimary) return target;
            foreach (var image in images.Where(x => x.IsPrimary)) image.IsPrimary = false;
            await db.SaveChangesAsync(ct); // Release the partial unique index before promoting the target.
            target.IsPrimary = true;
            await db.SaveChangesAsync(ct);
            return target;
        }, ct);

    public Task DeleteAsync(Guid recipeId, Guid imageId, CancellationToken ct) =>
        ExecuteAsync(recipeId, async db =>
        {
            var target = await db.RecipeImages.IgnoreQueryFilters()
                .SingleOrDefaultAsync(x => x.Id == imageId && x.RecipeId == recipeId, ct)
                ?? throw new NotFoundException("RecipeImage", imageId);
            if (target.IsDeleted) return target;
            target.IsPrimary = false;
            target.IsDeleted = true;
            await db.SaveChangesAsync(ct);
            var remaining = await db.RecipeImages.Where(x => x.RecipeId == recipeId)
                .OrderBy(x => x.OrderIndex).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(ct);
            if (remaining.Count > 0 && !remaining.Any(x => x.IsPrimary))
            {
                remaining[0].IsPrimary = true;
                await db.SaveChangesAsync(ct);
            }
            return target;
        }, ct);

    private async Task<RecipeImage> ExecuteAsync(Guid recipeId,
        Func<ApplicationDbContext, Task<RecipeImage>> mutation, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var strategyDb = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        try
        {
            return await strategyDb.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                // A fresh tracker on every retry prevents stale RowVersion/original values.
                using var attempt = scopes.CreateScope();
                var db = attempt.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                var recipe = await db.Recipes.FromSqlInterpolated(
                    $"SELECT * FROM \"Recipes\" WHERE \"Id\" = {recipeId} FOR UPDATE")
                    .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("Recipe", recipeId);
                RecipeImageAccess.EnsureOwner(recipe, user);
                var result = await mutation(db);
                // AuditInterceptor rotates the recipe's version as for other editor mutations.
                recipe.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);

                if (cacheInvalidator is not null)
                {
                    await cacheInvalidator.InvalidateRecipeAsync(
                        recipeId,
                        recipe.Slug,
                        CancellationToken.None);
                }
                return result;
            });
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("Ảnh vừa được thay đổi. Vui lòng tải lại và thử lại.", "RECIPE_IMAGE_CONFLICT");
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ConflictException("Bộ sưu tập ảnh vừa được thay đổi. Vui lòng tải lại và thử lại.", "RECIPE_IMAGE_CONFLICT");
        }
    }
}
