using System.Security.Claims;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using CulinaryBlog.Infrastructure.Persistence;
using Hangfire;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.API.Endpoints;

public static class RecipeManagementEndpoints
{
    private const long MaxImageBytes = 5 * 1024 * 1024;

    public static IEndpointRouteBuilder MapRecipeManagementEndpoints(this IEndpointRouteBuilder app)
    {
        var recipes = app.MapApiV1Group("recipes").WithTags("Recipe Management").RequireAuthorization("AuthorPolicy");

        recipes.MapGet("/{id:guid}/manage", async (Guid id, HttpContext http, IRecipeRepository repository, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            return Results.Ok(new
            {
                recipe.Id, recipe.Title, recipe.Slug, recipe.Description, recipe.Instructions,
                prepTime = recipe.PrepTime, cookTime = recipe.CookTime, recipe.Servings,
                difficulty = recipe.Difficulty, recipe.CategoryId, recipe.Status,
                rowVersion = Convert.ToBase64String(recipe.RowVersion),
                ingredients = recipe.Ingredients.OrderBy(x => x.OrderIndex).Select(x => new
                {
                    x.Id, x.RecipeId, x.Name, x.Quantity, x.Unit, x.Notes, x.OrderIndex
                }),
                steps = recipe.Steps.OrderBy(x => x.StepNumber).Select(x => new
                {
                    x.Id, x.RecipeId, stepNumber = x.StepNumber, x.Title, x.Description, x.TimerMinutes, x.ImageUrl
                }),
                images = recipe.Images.OrderBy(x => x.OrderIndex).Select(x => new
                {
                    x.Id, x.RecipeId, originalUrl = x.OriginalUrl, x.MediumUrl, x.ThumbnailUrl,
                    altText = x.AltText, x.IsPrimary, x.OrderIndex, processingStatus = x.ProcessingStatus.ToString()
                }),
                nutrition = recipe.Nutrition is null ? null : new
                {
                    recipe.Nutrition.Calories, recipe.Nutrition.Protein, recipe.Nutrition.Carbohydrates,
                    recipe.Nutrition.Fat, recipe.Nutrition.Fiber, recipe.Nutrition.Sodium
                }
            });
        })
        .WithName("GetManagedRecipeDetails")
        .WithSummary("Get recipe details for its owner or an Admin to edit")
        .Produces(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound);

        recipes.MapDelete("/{id:guid}", async (Guid id, HttpContext http, IRecipeRepository repository, IUnitOfWork unitOfWork, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            recipe.Archive();
            recipe.IsDeleted = true;
            recipe.UpdatedAt = DateTime.UtcNow;
            unitOfWork.Recipes.Update(recipe);
            await unitOfWork.SaveChangesAsync(ct);
            return Results.NoContent();
        })
        .WithName("DeleteRecipe")
        .WithSummary("Soft delete recipe (FR-RCP-007)")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound);

        recipes.MapPost("/{id:guid}/ingredients", async (Guid id, IngredientRequest request, HttpContext http, IRecipeRepository repository, ApplicationDbContext db, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            ValidateIngredient(request);
            var ingredient = RecipeIngredient.Create(recipe.Id, request.Name.Trim(), request.Quantity, request.Unit?.Trim(), request.Notes?.Trim(), request.OrderIndex ?? recipe.Ingredients.Count);
            db.RecipeIngredients.Add(ingredient);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/recipes/{id}/ingredients/{ingredient.Id}", new
            {
                ingredient.Id, ingredient.RecipeId, ingredient.Name, ingredient.Quantity,
                ingredient.Unit, ingredient.Notes, ingredient.OrderIndex
            });
        })
        .WithName("AddRecipeIngredient")
        .Produces<RecipeIngredient>(StatusCodes.Status201Created);

        recipes.MapPut("/{id:guid}/ingredients/{ingredientId:guid}", async (Guid id, Guid ingredientId, IngredientRequest request, HttpContext http, IRecipeRepository repository, ApplicationDbContext db, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            ValidateIngredient(request);
            var ingredient = recipe.Ingredients.FirstOrDefault(x => x.Id == ingredientId) ?? throw new NotFoundException("RecipeIngredient", ingredientId);
            ingredient.Name = request.Name.Trim();
            ingredient.Quantity = request.Quantity;
            ingredient.Unit = request.Unit?.Trim();
            ingredient.Notes = request.Notes?.Trim();
            ingredient.OrderIndex = request.OrderIndex ?? ingredient.OrderIndex;
            ingredient.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                ingredient.Id, ingredient.RecipeId, ingredient.Name, ingredient.Quantity,
                ingredient.Unit, ingredient.Notes, ingredient.OrderIndex
            });
        })
        .WithName("UpdateRecipeIngredient")
        .Produces<RecipeIngredient>(StatusCodes.Status200OK);

        recipes.MapDelete("/{id:guid}/ingredients/{ingredientId:guid}", async (Guid id, Guid ingredientId, HttpContext http, IRecipeRepository repository, ApplicationDbContext db, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            var ingredient = recipe.Ingredients.FirstOrDefault(x => x.Id == ingredientId) ?? throw new NotFoundException("RecipeIngredient", ingredientId);
            db.RecipeIngredients.Remove(ingredient);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        })
        .WithName("DeleteRecipeIngredient")
        .Produces(StatusCodes.Status204NoContent);

        recipes.MapPost("/{id:guid}/steps", async (Guid id, StepRequest request, HttpContext http, IRecipeRepository repository, ApplicationDbContext db, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            ValidateStep(request);
            var number = recipe.Steps.Count == 0 ? 1 : recipe.Steps.Max(x => x.StepNumber) + 1;
            var step = RecipeStep.Create(recipe.Id, number, request.Title?.Trim() is { Length: > 0 } title ? title : $"Bước {number}", request.Description.Trim(), request.TimerMinutes, request.ImageUrl?.Trim());
            db.RecipeSteps.Add(step);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/recipes/{id}/steps/{step.Id}", new
            {
                step.Id, step.RecipeId, stepNumber = step.StepNumber, step.Title,
                step.Description, step.TimerMinutes, step.ImageUrl
            });
        })
        .WithName("AddRecipeStep")
        .Produces<RecipeStep>(StatusCodes.Status201Created);

        recipes.MapPut("/{id:guid}/steps/{stepId:guid}", async (Guid id, Guid stepId, StepRequest request, HttpContext http, IRecipeRepository repository, ApplicationDbContext db, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            ValidateStep(request);
            var step = recipe.Steps.FirstOrDefault(x => x.Id == stepId) ?? throw new NotFoundException("RecipeStep", stepId);
            step.Title = string.IsNullOrWhiteSpace(request.Title) ? $"Bước {step.StepNumber}" : request.Title.Trim();
            step.Description = request.Description.Trim();
            step.TimerMinutes = request.TimerMinutes;
            step.ImageUrl = request.ImageUrl?.Trim();
            step.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                step.Id, step.RecipeId, stepNumber = step.StepNumber, step.Title,
                step.Description, step.TimerMinutes, step.ImageUrl
            });
        })
        .WithName("UpdateRecipeStep")
        .Produces<RecipeStep>(StatusCodes.Status200OK);

        recipes.MapPut("/{id:guid}/steps/reorder", async (Guid id, ReorderStepsRequest request, HttpContext http, IRecipeRepository repository, ApplicationDbContext db, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            var current = recipe.Steps.OrderBy(x => x.StepNumber).ToArray();
            if (request.StepIds is null || request.StepIds.Count != current.Length || request.StepIds.Distinct().Count() != current.Length || request.StepIds.Any(stepId => current.All(x => x.Id != stepId)))
                throw new ValidationException("StepIds", "Danh sách phải chứa đúng một lần tất cả các bước của công thức.");

            var strategy = db.Database.CreateExecutionStrategy();
            await strategy.ExecuteAsync(async () =>
            {
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                for (var index = 0; index < current.Length; index++)
                    current.Single(x => x.Id == request.StepIds[index]).StepNumber = -(index + 1);
                await db.SaveChangesAsync(ct);
                for (var index = 0; index < request.StepIds.Count; index++)
                {
                    var step = current.Single(x => x.Id == request.StepIds[index]);
                    step.StepNumber = index + 1;
                    step.UpdatedAt = DateTime.UtcNow;
                }
                recipe.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
            });
            return Results.Ok(recipe.Steps.OrderBy(x => x.StepNumber).Select(x => new
            {
                x.Id, x.RecipeId, stepNumber = x.StepNumber, x.Title,
                x.Description, x.TimerMinutes, x.ImageUrl
            }));
        })
        .WithName("ReorderRecipeSteps")
        .Produces(StatusCodes.Status200OK);

        recipes.MapDelete("/{id:guid}/steps/{stepId:guid}", async (Guid id, Guid stepId, HttpContext http, IRecipeRepository repository, ApplicationDbContext db, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            var steps = recipe.Steps.OrderBy(x => x.StepNumber).ToArray();
            var step = steps.FirstOrDefault(x => x.Id == stepId) ?? throw new NotFoundException("RecipeStep", stepId);
            if (recipe.Status == RecipeStatus.Published && steps.Length == 1)
                throw new ValidationException("Steps", "Không thể xóa bước cuối cùng của công thức đang xuất bản.");

            var remaining = steps.Where(x => x.Id != stepId).ToArray();
            var strategy = db.Database.CreateExecutionStrategy();
            await strategy.ExecuteAsync(async () =>
            {
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                db.RecipeSteps.Remove(step);
                await db.SaveChangesAsync(ct);
                for (var index = 0; index < remaining.Length; index++) remaining[index].StepNumber = -(index + 1);
                await db.SaveChangesAsync(ct);
                for (var index = 0; index < remaining.Length; index++) remaining[index].StepNumber = index + 1;
                recipe.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
            });
            return Results.NoContent();
        })
        .WithName("DeleteRecipeStep")
        .Produces(StatusCodes.Status204NoContent);

        recipes.MapPost("/{id:guid}/images", async (Guid id, IFormFile file, string? altText, HttpContext http, IRecipeRepository repository, IFileStorageService storage, IBackgroundJobClient jobs, ApplicationDbContext db, ILoggerFactory loggerFactory, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            if (file.Length is <= 0 or > MaxImageBytes) throw new ValidationException("File", "Ảnh phải có kích thước từ 1 byte đến 5 MB.");
            var extension = await GetImageExtension(file, ct);
            var order = recipe.Images.Count == 0 ? 0 : recipe.Images.Max(x => x.OrderIndex) + 1;
            var primary = recipe.Images.Count == 0;
            string imageUrl;
            await using (var stream = file.OpenReadStream())
                imageUrl = await storage.UploadAsync(stream, $"{Guid.NewGuid():N}.{extension}", file.ContentType, $"recipes/{recipe.Id}", ct);

            var image = RecipeImage.Create(recipe.Id, imageUrl, altText?.Trim(), primary, order);
            db.RecipeImages.Add(image);
            try { await db.SaveChangesAsync(ct); }
            catch { await storage.DeleteAsync(imageUrl, ct); throw; }
            try { jobs.Enqueue<ImageResizeJob>(job => job.ExecuteAsync(image.Id)); }
            catch (Exception exception)
            {
                loggerFactory.CreateLogger("RecipeImageUpload").LogError(exception, "Could not enqueue image resize job for {ImageId}", image.Id);
                image.ProcessingStatus = ImageProcessingStatus.Failed;
                await db.SaveChangesAsync(ct);
            }
            return Results.Created($"/api/v1/recipes/{id}/images/{image.Id}", new { success = true, message = "Image uploaded.", data = new { id = image.Id, recipeId = image.RecipeId, originalUrl = image.OriginalUrl, mediumUrl = image.MediumUrl, thumbnailUrl = image.ThumbnailUrl, altText = image.AltText, isPrimary = image.IsPrimary, orderIndex = image.OrderIndex, processingStatus = image.ProcessingStatus.ToString() } });
        })
        .WithName("UploadRecipeImage")
        .DisableAntiforgery()
        .WithMetadata(new RequestSizeLimitAttribute(MaxImageBytes + 256 * 1024))
        .Accepts<IFormFile>("multipart/form-data")
        .Produces(StatusCodes.Status201Created)
        .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        recipes.MapGet("/{id:guid}/images/{imageId:guid}", async (Guid id, Guid imageId, HttpContext http, IRecipeRepository repository, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            var image = recipe.Images.FirstOrDefault(x => x.Id == imageId) ?? throw new NotFoundException("RecipeImage", imageId);
            return Results.Ok(new { success = true, message = (string?)null, data = new { id = image.Id, recipeId = image.RecipeId, originalUrl = image.OriginalUrl, mediumUrl = image.MediumUrl, thumbnailUrl = image.ThumbnailUrl, altText = image.AltText, isPrimary = image.IsPrimary, orderIndex = image.OrderIndex, processingStatus = image.ProcessingStatus.ToString() } });
        })
        .WithName("GetRecipeImageProcessingStatus")
        .Produces(StatusCodes.Status200OK);

        recipes.MapPatch("/{id:guid}/images/{imageId:guid}/primary", async (Guid id, Guid imageId, HttpContext http, IRecipeRepository repository, ApplicationDbContext db, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            var selected = recipe.Images.FirstOrDefault(x => x.Id == imageId) ?? throw new NotFoundException("RecipeImage", imageId);
            foreach (var image in recipe.Images) image.IsPrimary = image.Id == selected.Id;
            recipe.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                selected.Id, selected.RecipeId, originalUrl = selected.OriginalUrl,
                selected.MediumUrl, selected.ThumbnailUrl, altText = selected.AltText,
                selected.IsPrimary, selected.OrderIndex, processingStatus = selected.ProcessingStatus.ToString()
            });
        })
        .WithName("SetPrimaryRecipeImage")
        .Produces<RecipeImage>(StatusCodes.Status200OK);

        recipes.MapDelete("/{id:guid}/images/{imageId:guid}", async (Guid id, Guid imageId, HttpContext http, IRecipeRepository repository, IFileStorageService storage, ApplicationDbContext db, CancellationToken ct) =>
        {
            var recipe = await GetManagedRecipe(id, http, repository, ct);
            var image = recipe.Images.FirstOrDefault(x => x.Id == imageId) ?? throw new NotFoundException("RecipeImage", imageId);
            var wasPrimary = image.IsPrimary;
            db.RecipeImages.Remove(image);
            if (wasPrimary)
            {
                var next = recipe.Images.Where(x => x.Id != image.Id).OrderBy(x => x.OrderIndex).FirstOrDefault();
                if (next is not null) next.IsPrimary = true;
            }
            await db.SaveChangesAsync(ct);
            await storage.DeleteAsync(image.OriginalUrl, ct);
            if (image.MediumUrl is not null) await storage.DeleteAsync(image.MediumUrl, ct);
            if (image.ThumbnailUrl is not null) await storage.DeleteAsync(image.ThumbnailUrl, ct);
            return Results.NoContent();
        })
        .WithName("DeleteRecipeImage")
        .Produces(StatusCodes.Status204NoContent);

        return app;
    }

    private static async Task<Recipe> GetManagedRecipe(Guid id, HttpContext http, IRecipeRepository repository, CancellationToken ct)
    {
        var recipe = await repository.GetDetailsByIdAsync(id, ct);
        if (recipe is null || recipe.IsDeleted) throw new NotFoundException("Recipe", id);
        var currentUserId = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!http.User.IsInRole("Admin") && !string.Equals(recipe.AuthorId, currentUserId, StringComparison.Ordinal)) throw new ForbiddenException();
        return recipe;
    }

    private static void ValidateIngredient(IngredientRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 200 || request.Quantity is <= 0 or > 9_999_999.999m || request.Unit?.Length > 50 || request.Notes?.Length > 500 || request.OrderIndex is < 0)
            throw new ValidationException("Ingredient", "Thông tin nguyên liệu không hợp lệ.");
    }

    private static void ValidateStep(StepRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Description) || request.Description.Trim().Length > 2000 || request.Title?.Length > 200 || request.TimerMinutes is < 0 || request.ImageUrl?.Length > 500)
            throw new ValidationException("Step", "Thông tin bước thực hiện không hợp lệ.");
    }

    private static async Task<string> GetImageExtension(IFormFile file, CancellationToken ct)
    {
        var header = new byte[12];
        await using var stream = file.OpenReadStream();
        var read = await stream.ReadAsync(header.AsMemory(0, header.Length), ct);
        var mime = file.ContentType.ToLowerInvariant();
        var extension = mime switch
        {
            "image/jpeg" when read >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF => "jpg",
            "image/png" when read >= 8 && header.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }) => "png",
            "image/webp" when read >= 12 && header.AsSpan(0, 4).SequenceEqual("RIFF"u8) && header.AsSpan(8, 4).SequenceEqual("WEBP"u8) => "webp",
            "image/avif" when read >= 12 && header.AsSpan(4, 4).SequenceEqual("ftyp"u8) && (header.AsSpan(8, 4).SequenceEqual("avif"u8) || header.AsSpan(8, 4).SequenceEqual("avis"u8)) => "avif",
            _ => throw new ValidationException("File", "Tệp không đúng định dạng JPEG, PNG, WebP hoặc AVIF.")
        };
        return extension;
    }
}

public sealed record IngredientRequest(string Name, decimal? Quantity = null, string? Unit = null, string? Notes = null, int? OrderIndex = null);
public sealed record StepRequest(string Description, string? Title = null, int? TimerMinutes = null, string? ImageUrl = null);
public sealed record ReorderStepsRequest(List<Guid> StepIds);
