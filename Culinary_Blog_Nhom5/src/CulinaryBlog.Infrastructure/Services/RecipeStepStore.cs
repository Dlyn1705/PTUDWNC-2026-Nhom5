using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Steps;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class RecipeStepStore(IServiceScopeFactory scopes, ICurrentUserService user,
    IRecipeCacheInvalidator cache) : IRecipeStepStore
{
    public async Task<StepSnapshot> ReadAsync(Guid recipeId, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var recipe = await db.Recipes.AsNoTracking().Include(r => r.Steps)
            .SingleOrDefaultAsync(r => r.Id == recipeId, ct) ?? throw new NotFoundException("Recipe", recipeId);
        StepRules.EnsureOwner(recipe, user);
        return Snapshot(recipe, recipe.Steps);
    }

    public async Task<StepSnapshot> MutateAsync(StepMutation mutation, CancellationToken ct)
    {
        using var strategyScope = scopes.CreateScope();
        var strategyDb = strategyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        StepSnapshot? committedCandidate = null;
        string? slug = null;
        StepSnapshot result;
        try
        {
            result = await strategyDb.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                var recipe = await LockedRecipe(db, mutation.RecipeId, ct);
                slug = recipe.Slug;
                // A commit may succeed while its ACK is lost. Only recognize our
                // own saved token; never silently apply a stale request a second time.
                if (committedCandidate is not null && Convert.ToBase64String(recipe.RowVersion) == committedCandidate.RowVersion)
                    return committedCandidate;
                if (mutation.ExpectedVersion is not { Length: 16 }) throw new ValidationException("If-Match", "Version không hợp lệ.");
                if (!recipe.RowVersion.SequenceEqual(mutation.ExpectedVersion)) throw Conflict();
                var active = await db.RecipeSteps.Where(s => s.RecipeId == recipe.Id)
                    .OrderBy(s => s.StepNumber).ThenBy(s => s.CreatedAt).ThenBy(s => s.Id).ToListAsync(ct);
                switch (mutation.Operation)
                {
                    case StepOperation.Add:
                        if (active.Count >= StepRules.MaximumCount) throw new ValidationException("steps", "Mỗi công thức tối đa 100 bước.");
                        var number = checked((active.Count == 0 ? 0 : active.Max(s => s.StepNumber)) + 1);
                        var added = RecipeStep.Create(recipe.Id, number, "", "");
                        added.Id = mutation.StepId ?? throw new ValidationException("step", "Thiếu mã bước cho thao tác thêm.");
                        StepRules.Apply(added, mutation.Input ?? throw new ValidationException("step", "Thiếu dữ liệu bước."));
                        db.RecipeSteps.Add(added); active.Add(added);
                        break;
                    case StepOperation.Update:
                        var target = active.SingleOrDefault(s => s.Id == mutation.StepId)
                            ?? throw new NotFoundException("RecipeStep", mutation.StepId ?? Guid.Empty);
                        StepRules.Apply(target, mutation.Input ?? throw new ValidationException("step", "Thiếu dữ liệu bước."));
                        break;
                    case StepOperation.Delete:
                        var removed = active.SingleOrDefault(s => s.Id == mutation.StepId)
                            ?? throw new NotFoundException("RecipeStep", mutation.StepId ?? Guid.Empty);
                        if (recipe.Status == RecipeStatus.Published && active.Count == 1)
                            throw new ValidationException("steps", "Không thể xóa bước duy nhất của công thức đã xuất bản. Hãy hủy xuất bản trước.");
                        removed.IsDeleted = true;
                        active.Remove(removed);
                        await db.SaveChangesAsync(ct); // Release the deleted row's active unique slot first.
                        await Renumber(db, active, ct);
                        break;
                    case StepOperation.Reorder:
                        var ids = mutation.StepIds;
                        if (ids is null || ids.Count != active.Count || ids.Distinct().Count() != ids.Count ||
                            !ids.ToHashSet().SetEquals(active.Select(s => s.Id)))
                            throw new ValidationException("stepIds", "Danh sách phải chứa đúng mỗi bước hiện tại một lần.");
                        var lookup = active.ToDictionary(s => s.Id);
                        active = ids.Select(id => lookup[id]).ToList();
                        await Renumber(db, active, ct);
                        break;
                    default: throw new ValidationException("operation", "Thao tác không hợp lệ.");
                }
                recipe.UpdatedAt = DateTime.UtcNow;
                db.Entry(recipe).Property(r => r.UpdatedAt).IsModified = true;
                await db.SaveChangesAsync(ct);
                committedCandidate = Snapshot(recipe, active);
                await transaction.CommitAsync(ct);
                return committedCandidate;
            });
        }
        catch (DbUpdateConcurrencyException) { throw Conflict(); }
        catch (DbUpdateException error) when (error.InnerException is PostgresException
            { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "IX_RecipeSteps_RecipeId_StepNumber" }) { throw Conflict(); }
        catch (OverflowException) { throw new ConflictException("Số bước cũ không hợp lệ. Cần chuẩn hóa dữ liệu trước khi thao tác."); }
        await cache.InvalidateRecipeAsync(mutation.RecipeId, slug, CancellationToken.None);
        return result;
    }

    public async Task<RecipePublishResult> PublishAsync(Guid recipeId, CancellationToken ct)
    {
        using var strategyScope = scopes.CreateScope();
        var strategyDb = strategyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        string? slug = null;
        var wasPublished = false;
        try
        {
            var result = await strategyDb.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                var recipe = await LockedRecipe(db, recipeId, ct);
                slug = recipe.Slug;
                if (recipe.Status == RecipeStatus.Archived) throw new ConflictException("Hãy khôi phục công thức về bản nháp trước khi xuất bản.");
                recipe.Steps = await db.RecipeSteps.Where(s => s.RecipeId == recipeId).ToListAsync(ct);
                if (recipe.Steps.Count == 0) throw new ValidationException("steps", "Công thức phải có ít nhất một bước trước khi xuất bản.");
                if (recipe.Status != RecipeStatus.Published)
                {
                    recipe.Publish();
                    await db.SaveChangesAsync(ct);
                    wasPublished = true;
                    await transaction.CommitAsync(ct);
                }
                return new RecipePublishResult(recipe.Id, recipe.Status, recipe.PublishedAt, wasPublished);
            });
            await cache.InvalidateRecipeAsync(recipeId, slug, CancellationToken.None);
            return result;
        }
        catch (DbUpdateConcurrencyException) { throw Conflict(); }
    }

    private async Task<Recipe> LockedRecipe(ApplicationDbContext db, Guid id, CancellationToken ct)
    {
        var recipe = await db.Recipes.FromSqlInterpolated($"SELECT * FROM \"Recipes\" WHERE \"Id\" = {id} FOR UPDATE")
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("Recipe", id);
        StepRules.EnsureOwner(recipe, user);
        return recipe;
    }

    private static async Task Renumber(ApplicationDbContext db, List<RecipeStep> steps, CancellationToken ct)
    {
        if (steps.Count == 0) return;
        var offset = checked(Math.Max(0, steps.Max(s => s.StepNumber)) + steps.Count + 1);
        for (var index = 0; index < steps.Count; index++) steps[index].StepNumber = checked(offset + index);
        await db.SaveChangesAsync(ct); // Unique-safe parking range, never visible outside the transaction.
        for (var index = 0; index < steps.Count; index++) steps[index].StepNumber = index + 1;
    }

    private static StepSnapshot Snapshot(Recipe recipe, IEnumerable<RecipeStep> steps) =>
        new(steps.Where(s => !s.IsDeleted).OrderBy(s => s.StepNumber).Select(StepRules.ToDto).ToList(), Convert.ToBase64String(recipe.RowVersion));
    private static ConflictException Conflict() => new("Công thức vừa được thay đổi. Hãy tải lại trước khi lưu bước.", "RECIPE_STEP_CONFLICT");
}
