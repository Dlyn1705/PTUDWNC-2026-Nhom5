using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Ingredients;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class RecipeIngredientStore(
    IServiceScopeFactory scopes,
    ICurrentUserService user,
    IRecipeCacheInvalidator cache) : IRecipeIngredientStore
{
    public async Task<IngredientSnapshot> ReadAsync(Guid recipeId, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var recipe = await db.Recipes.AsNoTracking().Include(x => x.Ingredients)
            .SingleOrDefaultAsync(x => x.Id == recipeId, ct) ?? throw new NotFoundException("Recipe", recipeId);
        IngredientRules.EnsureOwner(recipe, user);
        return Snapshot(recipe, recipe.Ingredients.Where(x => !x.IsDeleted));
    }

    public async Task<IngredientSnapshot> MutateAsync(IngredientMutation mutation, CancellationToken ct)
    {
        using var strategyScope = scopes.CreateScope();
        var strategyDb = strategyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        try
        {
            var result = await strategyDb.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                // Same lock as image mutations: concurrent child/basic edits must honor Recipe.RowVersion.
                var recipe = await db.Recipes.FromSqlInterpolated(
                    $"SELECT * FROM \"Recipes\" WHERE \"Id\" = {mutation.RecipeId} FOR UPDATE")
                    .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("Recipe", mutation.RecipeId);
                IngredientRules.EnsureOwner(recipe, user);
                if (!recipe.RowVersion.SequenceEqual(mutation.ExpectedVersion))
                    throw new ConflictException("Công thức vừa được thay đổi. Hãy tải lại trước khi lưu.", "RECIPE_INGREDIENT_CONFLICT");
                var active = await db.RecipeIngredients.Where(x => x.RecipeId == recipe.Id)
                    .OrderBy(x => x.OrderIndex).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(ct);
                switch (mutation.Operation)
                {
                    case IngredientOperation.Add:
                        if (active.Count >= IngredientRules.MaximumCount)
                            throw new ValidationException("ingredients", "Mỗi công thức có tối đa 100 nguyên liệu.");
                        var input = mutation.Input!;
                        IngredientRules.Validate(input);
                        var added = RecipeIngredient.Create(recipe.Id, input.Name!, input.Quantity, input.Unit, input.Notes);
                        active.Add(added);
                        db.RecipeIngredients.Add(added);
                        break;
                    case IngredientOperation.Update:
                        var target = active.SingleOrDefault(x => x.Id == mutation.IngredientId)
                            ?? throw new NotFoundException("RecipeIngredient", mutation.IngredientId ?? Guid.Empty);
                        IngredientRules.Validate(mutation.Input!);
                        target.Update(mutation.Input!.Name!, mutation.Input.Quantity, mutation.Input.Unit, mutation.Input.Notes);
                        break;
                    case IngredientOperation.Delete:
                        var removed = await db.RecipeIngredients.IgnoreQueryFilters().SingleOrDefaultAsync(
                            x => x.RecipeId == recipe.Id && x.Id == mutation.IngredientId, ct)
                            ?? throw new NotFoundException("RecipeIngredient", mutation.IngredientId ?? Guid.Empty);
                        if (removed.IsDeleted) return Snapshot(recipe, active);
                        removed.IsDeleted = true;
                        active.RemoveAll(x => x.Id == removed.Id);
                        break;
                    case IngredientOperation.Reorder:
                        var ids = mutation.IngredientIds;
                        if (ids is null || ids.Count != active.Count || ids.Distinct().Count() != ids.Count ||
                            !ids.ToHashSet().SetEquals(active.Select(x => x.Id)))
                            throw new ValidationException("ingredientIds", "Danh sách phải chứa đúng mỗi nguyên liệu hiện tại một lần.");
                        var lookup = active.ToDictionary(x => x.Id);
                        active = ids.Select(id => lookup[id]).ToList();
                        break;
                    default: throw new ValidationException("operation", "Thao tác không hợp lệ.");
                }
                for (var index = 0; index < active.Count; index++) active[index].OrderIndex = index;
                recipe.UpdatedAt = DateTime.UtcNow;
                db.Entry(recipe).Property(x => x.UpdatedAt).IsModified = true;
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
                return Snapshot(recipe, active);
            });
            await cache.InvalidateRecipeAsync(mutation.RecipeId, null, CancellationToken.None);
            return result;
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException("Dữ liệu vừa được thay đổi. Hãy tải lại trước khi lưu.", "RECIPE_INGREDIENT_CONFLICT");
        }
    }

    private static IngredientSnapshot Snapshot(Recipe recipe, IEnumerable<RecipeIngredient> ingredients) =>
        new(ingredients.OrderBy(x => x.OrderIndex).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id)
            .Select(IngredientRules.ToDto).ToList(), Convert.ToBase64String(recipe.RowVersion));
}
