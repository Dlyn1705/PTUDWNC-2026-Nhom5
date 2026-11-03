using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Lifecycle;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class RecipeLifecycleStore(IServiceScopeFactory scopes, ICurrentUserService user, IRecipeCacheInvalidator cache)
    : IRecipeLifecycleStore
{
    public async Task<RecipeLifecycleResult> ChangeAsync(Guid recipeId, RecipeLifecycleOperation operation, CancellationToken ct)
    {
        using var strategyScope = scopes.CreateScope();
        var strategy = strategyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.CreateExecutionStrategy();
        string? slug = null;
        RecipeLifecycleResult? committedCandidate = null;
        byte[]? committedVersion = null;
        try
        {
            var result = await strategy.ExecuteAsync(async () =>
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                var recipe = await db.Recipes.FromSqlInterpolated($"SELECT * FROM \"Recipes\" WHERE \"Id\" = {recipeId} FOR UPDATE")
                    .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("Recipe", recipeId);
                if (!user.IsAuthenticated || (!user.IsAdmin && (!user.Roles.Contains("Author") || user.UserId != recipe.AuthorId)))
                    throw new ForbiddenException();
                slug = recipe.Slug;
                // A successful commit may lose its ACK; recognize only this invocation's saved version.
                if (committedCandidate is not null && recipe.RowVersion.SequenceEqual(committedVersion!)) return committedCandidate;
                switch (operation)
                {
                    case RecipeLifecycleOperation.Unpublish: recipe.Unpublish(); break;
                    case RecipeLifecycleOperation.Archive: recipe.Archive(); break;
                    case RecipeLifecycleOperation.Unarchive: recipe.RestoreFromArchive(); break;
                    default: throw new ValidationException("operation", "Thao tác không hợp lệ.");
                }
                await db.SaveChangesAsync(ct);
                committedVersion = recipe.RowVersion.ToArray();
                committedCandidate = new RecipeLifecycleResult(recipe.Id, recipe.Status, recipe.PublishedAt, recipe.UpdatedAt);
                await transaction.CommitAsync(ct);
                return committedCandidate;
            });
            await cache.InvalidateRecipeAsync(recipeId, slug, CancellationToken.None);
            return result;
        }
        catch (DbUpdateConcurrencyException) { throw new ConflictException("Dữ liệu vừa thay đổi. Hãy tải lại công thức."); }
    }
}
