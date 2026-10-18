using CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipe;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class RecipeUpdateStore(ApplicationDbContext readContext, IServiceScopeFactory scopes) : IRecipeUpdateStore
{
    public Task<Recipe?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        readContext.Recipes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken);

    public async Task<UpdatedRecipe> SaveAsync(Recipe desired, byte[] expectedVersion, string actorId, CancellationToken ct)
    {
        var strategy = readContext.Database.CreateExecutionStrategy();
        byte[]? writtenVersion = null;
        return await strategy.ExecuteAsync(async () =>
        {
            // Never reuse a failed change tracker across execution-strategy attempts.
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var recipe = await db.Recipes.SingleOrDefaultAsync(x => x.Id == desired.Id, ct)
                ?? throw new NotFoundException("Recipe", desired.Id);
            if (writtenVersion is not null && recipe.RowVersion.SequenceEqual(writtenVersion))
                return Result(recipe); // A previous attempt committed but its acknowledgement was lost.
            if (!recipe.RowVersion.SequenceEqual(expectedVersion) || recipe.AuthorId != desired.AuthorId)
                throw Conflict();
            var actor = await db.Users.FromSqlInterpolated(
                $"SELECT * FROM \"AspNetUsers\" WHERE \"Id\" = {actorId} FOR SHARE")
                .AsNoTracking().SingleOrDefaultAsync(ct);
            if (actor is null || !actor.IsActive) throw new ForbiddenException("Tài khoản không còn hoạt động.");
            var category = await db.Categories.FromSqlInterpolated(
                $"SELECT * FROM \"Categories\" WHERE \"Id\" = {desired.CategoryId} FOR SHARE")
                .AsNoTracking().SingleOrDefaultAsync(ct);
            if (category is null) throw new NotFoundException("Category", desired.CategoryId);

            // Copy only editable fields. Identity, slug, lifecycle and all child data stay server-owned.
            recipe.Update(desired.Title, desired.Description, desired.Instructions, desired.PrepTime,
                desired.CookTime, desired.Servings, desired.Difficulty, desired.CategoryId);
            db.Entry(recipe).Property(x => x.RowVersion).OriginalValue = expectedVersion;
            try
            {
                await db.SaveChangesAsync(ct);
                writtenVersion = recipe.RowVersion.ToArray();
                await transaction.CommitAsync(ct);
                return Result(recipe);
            }
            catch (DbUpdateConcurrencyException) { throw Conflict(); }
        });
    }

    private static ConflictException Conflict() => new("Công thức đã thay đổi. Vui lòng tải lại trước khi lưu.", "RECIPE_VERSION_CONFLICT");
    private static UpdatedRecipe Result(Recipe recipe) => new("Cập nhật công thức thành công.",
        recipe.Id, recipe.Slug, Convert.ToBase64String(recipe.RowVersion));
}
