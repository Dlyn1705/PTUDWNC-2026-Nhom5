using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeImages;
using CulinaryBlog.Application.Features.Recipes.Commands.SetRecipeImagePrimary;
using System;
using System.Security.Claims;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Common.Metrics;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Recipes.Queries.GetPublicRecipes;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeBySlug;
using CulinaryBlog.Application.Features.Recipes.Queries.SearchRecipes;
using CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipe;
using CulinaryBlog.Application.Features.Recipes.Commands.UploadRecipeImage;
using CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipeImage;
using CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipe;
using CulinaryBlog.Application.Features.Recipes.Commands.CreateRecipe;
using CulinaryBlog.Application.Features.Recipes.Steps;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Application.Features.Recipes.Ingredients;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using CulinaryBlog.Infrastructure.Persistence;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace CulinaryBlog.API.Endpoints;

public static class RecipeEndpoints
{
    public static IEndpointRouteBuilder MapRecipeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/recipes")
            .WithTags("Recipes");

        group.MapGet("/{recipeId:guid}/images", async (Guid recipeId, ISender sender, HttpContext context, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(ApiResponse<IReadOnlyList<RecipeImageDto>>.Ok(
                await sender.Send(new GetRecipeImagesQuery(recipeId), ct)));
        })
        .WithName("GetRecipeImages")
        .WithSummary("Láº¥y bá»™ sÆ°u táº­p áº£nh cá»§a cÃ´ng thá»©c (Owner/Admin)")
        .RequireAuthorization("AuthorPolicy")
        .Produces<ApiResponse<IReadOnlyList<RecipeImageDto>>>(StatusCodes.Status200OK)
        .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404);

        group.MapPatch("/{recipeId:guid}/images/{imageId:guid}/primary", async (
            Guid recipeId, Guid imageId, ISender sender, CancellationToken ct) =>
            Results.Ok(ApiResponse<RecipeImageDto>.Ok(
                await sender.Send(new SetRecipeImagePrimaryCommand(recipeId, imageId), ct))))
        .WithName("SetRecipeImagePrimary")
        .WithSummary("Äáº·t áº£nh chÃ­nh duy nháº¥t cho cÃ´ng thá»©c")
        .RequireAuthorization("AuthorPolicy")
        .Produces<ApiResponse<RecipeImageDto>>(StatusCodes.Status200OK)
        .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(409);

        group.MapPost("/{recipeId:guid}/images", async (
            Guid recipeId,
            IFormFile? file,
            [FromForm] string? altText,
            ISender sender,
            CancellationToken ct) =>
        {
            if (file is null)
                throw new ValidationException("file", "Vui lÃ²ng chá»n áº£nh cáº§n táº£i lÃªn.");
            await using var stream = file.OpenReadStream();
            var image = await sender.Send(new UploadRecipeImageCommand(
                recipeId, stream, file.FileName, file.ContentType, file.Length, altText), ct);
            return Results.Created($"/api/v1/recipes/{recipeId}/images/{image.Id}",
                ApiResponse<RecipeImageDto>.Ok(image, "Táº£i áº£nh thÃ nh cÃ´ng; cÃ¡c kÃ­ch thÆ°á»›c khÃ¡c Ä‘ang Ä‘Æ°á»£c xá»­ lÃ½."));
        })
        .WithName("UploadRecipeImage")
        .WithSummary("Táº£i áº£nh cÃ´ng thá»©c lÃªn MinIO")
        .Accepts<IFormFile>("multipart/form-data")
        .Produces<ApiResponse<RecipeImageDto>>(StatusCodes.Status201Created)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
        .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .ProducesProblem(StatusCodes.Status422UnprocessableEntity)
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .RequireAuthorization("AuthorPolicy")
        .RequireRateLimiting("upload")
        .DisableAntiforgery()
        .WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(6 * 1024 * 1024));

        group.MapDelete("/{recipeId:guid}/images/{imageId:guid}", async (
            Guid recipeId,
            Guid imageId,
            ISender sender,
            CancellationToken ct) =>
        {
            await sender.Send(new DeleteRecipeImageCommand(recipeId, imageId), ct);
            return Results.NoContent();
        })
        .WithName("DeleteRecipeImage")
        .RequireRateLimiting("recipe-write")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("XÃ³a áº£nh cÃ´ng thá»©c vÃ  dá»n cÃ¡c object khá»i MinIO (FR-FILE-002)")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .RequireAuthorization("AuthorPolicy");

        // FR-RCP-007: Soft delete cÃ´ng thá»©c. áº¢nh MinIO Ä‘Æ°á»£c giá»¯ láº¡i Ä‘á»ƒ PurgeDeletedRecipesJob
        // dá»n sau 30 ngÃ y.
        group.MapDelete("/{id:guid}", async (
            Guid id,
            ISender sender,
            CancellationToken ct) =>
        {
            await sender.Send(new DeleteRecipeCommand(id), ct);
            return Results.NoContent();
        })
        .WithName("DeleteRecipe")
        .WithSummary("XÃ³a má»m cÃ´ng thá»©c; áº£nh Ä‘Æ°á»£c giá»¯ láº¡i Ä‘á»ƒ dá»n sau 30 ngÃ y (FR-RCP-007)")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .RequireAuthorization("AuthorPolicy");

        group.MapGet("/{recipeId:guid}/images/{imageId:guid}", async (
            Guid recipeId, Guid imageId, ISender sender, HttpContext context, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var images = await sender.Send(new GetRecipeImagesQuery(recipeId, imageId), ct);
            return Results.Ok(ApiResponse<RecipeImageDto>.Ok(images[0]));
        })
        .WithName("GetRecipeImage")
        .RequireRateLimiting("recipe-read")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Láº¥y tráº¡ng thÃ¡i xá»­ lÃ½ áº£nh cÃ´ng thá»©c")
        .Produces<ApiResponse<RecipeImageDto>>(StatusCodes.Status200OK)
        .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404)
        .RequireAuthorization("AuthorPolicy");

        // FR-RCP-001: Xem Danh sÃ¡ch CÃ´ng thá»©c CÃ´ng cá»™ng (Paginated + Filtered)
        group.MapGet("/", async (
            int? page,
            int? pageSize,
            Guid? categoryId,
            RecipeDifficulty? difficulty,
            int? maxCookTime,
            string? sortBy,
            string? sortOrder,
            ISender sender,
            CancellationToken ct) =>
        {
            var query = new GetPublicRecipesQuery(
                page.GetValueOrDefault(1),
                pageSize.GetValueOrDefault(12),
                categoryId,
                difficulty,
                maxCookTime,
                sortBy,
                sortOrder);

            var result = await sender.Send(query, ct);
            return Results.Ok(result);
        })
        .WithName("GetRecipes")
        .RequireRateLimiting("recipe-read")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Láº¥y danh sÃ¡ch cÃ´ng thá»©c Ä‘Ã£ xuáº¥t báº£n kÃ¨m phÃ¢n trang vÃ  lá»c (FR-RCP-001)")
        .Produces<PagedResult<RecipeSummaryDto>>(StatusCodes.Status200OK);

        group.MapGet("/{id:guid}", async (
            Guid id,
            IRecipeRepository recipes,
            ICurrentUserService currentUser,
            ISender sender,
            HttpContext context,
            CancellationToken ct) =>
        {
            var recipe = await recipes.GetDetailsByIdAsync(id, ct);
            if (recipe is null || recipe.IsDeleted)
                throw new NotFoundException("Recipe", id);

            var canViewUnpublished = currentUser.IsAdmin
                || string.Equals(recipe.AuthorId, currentUser.UserId, StringComparison.Ordinal);
            if (recipe.Status != RecipeStatus.Published && !canViewUnpublished)
                throw new NotFoundException("Recipe", id);

            var detail = await sender.Send(new GetRecipeBySlugQuery(recipe.Slug), ct);
            context.Response.Headers.CacheControl = "no-store";
            context.Response.Headers.ETag = $"\"{detail.RowVersion}\"";
            return Results.Ok(detail);
        })
        .WithName("GetRecipeById")
        .RequireRateLimiting("recipe-read")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Láº¥y chi tiáº¿t cÃ´ng thá»©c theo ID; Owner/Admin xem Ä‘Æ°á»£c Draft vÃ  Archived")
        .Produces<RecipeDetailDto>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapGet("/mine", async (
            int? page,
            int? pageSize,
            RecipeStatus? status,
            string? sortBy,
            IRecipeRepository recipeRepo,
            ICurrentUserService currentUser,
            CancellationToken ct) =>
        {
            int p = Math.Max(1, page.GetValueOrDefault(1));
            int ps = Math.Clamp(pageSize.GetValueOrDefault(12), 1, 50);
            var (items, totalCount) = await recipeRepo.GetPagedAsync(
                p,
                ps,
                sortBy: sortBy,
                authorId: currentUser.IsAdmin ? null : currentUser.UserId,
                includeDrafts: true,
                status: status,
                ct: ct);

            var data = items.Select(recipe => new
            {
                recipe.Id,
                recipe.Title,
                recipe.Slug,
                recipe.Description,
                recipe.Status,
                recipe.UpdatedAt,
                Category = recipe.Category is null
                    ? null
                    : new { recipe.Category.Id, recipe.Category.Name },
                Author = recipe.Author is null
                    ? null
                    : new { recipe.Author.Id, recipe.Author.DisplayName },
                PrimaryImageUrl = recipe.Images
                    .Where(image => image.IsPrimary && !image.IsDeleted)
                    .Select(image => image.ThumbnailUrl ?? image.MediumUrl ?? image.OriginalUrl)
                    .FirstOrDefault()
            }).ToArray();
            var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)ps);

            return Results.Ok(new
            {
                data,
                meta = new
                {
                    page = p,
                    pageSize = ps,
                    totalCount,
                    totalPages,
                    hasNextPage = p < totalPages,
                    hasPreviousPage = p > 1
                }
            });
        })
        .WithName("GetManagedRecipes")
        .RequireRateLimiting("recipe-read")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Láº¥y danh sÃ¡ch cÃ´ng thá»©c cá»§a tÃ¡c giáº£ hoáº·c toÃ n bá»™ cÃ´ng thá»©c cho Admin")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden);

        // FR-SRCH-001: TÃ¬m kiáº¿m toÃ n vÄƒn báº£n cÃ´ng thá»©c náº¥u Äƒn
        group.MapGet("/search", async (
            [AsParameters] SearchRecipesQuery query,
            ISender sender,
            HttpContext context,
            CancellationToken ct) =>
        {
            var response = await sender.Send(query, ct);
            // Search includes URLs changed asynchronously by image processing. Until a shared tag
            // invalidation pipeline exists, do not cache these metadata responses in intermediaries.
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(response);
        })
        .WithName("SearchRecipes")
        .RequireRateLimiting("recipe-read")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("TÃ¬m kiáº¿m toÃ n vÄƒn báº£n cÃ´ng thá»©c náº¥u Äƒn (FR-SRCH-001)")
        .Produces<ApiResponse<PagedResult<SearchRecipeSummaryDto>>>(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status422UnprocessableEntity);

        // FR-RCP-006: LÆ°u trá»¯ cÃ´ng thá»©c
        group.MapPatch("/{id:guid}/archive", async (
            Guid id,
            IRecipeRepository recipeRepo,
            ICurrentUserService currentUser,
            IUnitOfWork unitOfWork,
            IRecipeCacheInvalidator cache,
            CancellationToken ct) =>
        {
            var recipe = await recipeRepo.GetDetailsByIdAsync(id, ct);
            if (recipe is null || recipe.IsDeleted)
                throw new NotFoundException("Recipe", id);

            if (!currentUser.IsAdmin && recipe.AuthorId != currentUser.UserId)
                throw new ForbiddenException();

            recipe.Archive();
            await unitOfWork.SaveChangesAsync(ct);
            await cache.InvalidateRecipeAsync(recipe.Id, recipe.Slug, CancellationToken.None);
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt, recipe.UpdatedAt });
        })
        .WithName("ArchiveRecipe")
        .RequireRateLimiting("recipe-write")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("LÆ°u trá»¯ cÃ´ng thá»©c, giá»¯ nguyÃªn dá»¯ liá»‡u vÃ  áº©n khá»i danh sÃ¡ch cÃ´ng khai")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict);

        group.MapPatch("/{id:guid}/unarchive", async (
            Guid id,
            IRecipeRepository recipeRepo,
            ICurrentUserService currentUser,
            IUnitOfWork unitOfWork,
            IRecipeCacheInvalidator cache,
            CancellationToken ct) =>
        {
            var recipe = await recipeRepo.GetDetailsByIdAsync(id, ct);
            if (recipe is null || recipe.IsDeleted)
                throw new NotFoundException("Recipe", id);

            if (!currentUser.IsAdmin && recipe.AuthorId != currentUser.UserId)
                throw new ForbiddenException();

            try
            {
                recipe.RestoreFromArchive();
            }
            catch (DomainException ex)
            {
                throw new ConflictException(ex.Message);
            }

            await unitOfWork.SaveChangesAsync(ct);
            await cache.InvalidateRecipeAsync(recipe.Id, recipe.Slug, CancellationToken.None);
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt, recipe.UpdatedAt });
        })
        .WithName("UnarchiveRecipe")
        .RequireRateLimiting("recipe-write")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("KhÃ´i phá»¥c cÃ´ng thá»©c Ä‘Ã£ lÆ°u trá»¯ vá» báº£n nhÃ¡p")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict);

        // FR-RCP-005: Xuáº¥t báº£n cÃ´ng thá»©c
        group.MapPatch("/{id:guid}/publish", async (
            Guid id,
            ISender sender,
            CancellationToken ct) =>
        {
            var result = await sender.Send(new PublishRecipeWithStepsCommand(id), ct);
            if (result.WasPublished) DiagnosticsConfig.RecipePublishedCounter.Add(1);
            return Results.Ok(result);
        })
        .WithName("PublishRecipe")
        .RequireRateLimiting("recipe-write")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Xuáº¥t báº£n cÃ´ng thá»©c (yÃªu cáº§u Ã­t nháº¥t má»™t bÆ°á»›c thá»±c hiá»‡n)")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict)
        .Produces<ProblemDetails>(StatusCodes.Status422UnprocessableEntity);

        group.MapPatch("/{id:guid}/unpublish", async (
            Guid id,
            IRecipeRepository recipeRepo,
            ICurrentUserService currentUser,
            ApplicationDbContext db,
            IRecipeCacheInvalidator cache,
            CancellationToken ct) =>
        {
            var recipe = await recipeRepo.GetDetailsByIdAsync(id, ct);
            if (recipe is null || recipe.IsDeleted)
                throw new NotFoundException("Recipe", id);

            if (!currentUser.IsAdmin && recipe.AuthorId != currentUser.UserId)
                throw new ForbiddenException();

            if (recipe.Status == RecipeStatus.Draft)
                return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt });

            if (recipe.Status == RecipeStatus.Archived)
                throw new ConflictException("KhÃ´ng thá»ƒ há»§y xuáº¥t báº£n cÃ´ng thá»©c Ä‘ang lÆ°u trá»¯.");

            recipe.Unpublish();
            await db.SaveChangesAsync(ct);
            await cache.InvalidateRecipeAsync(recipe.Id, recipe.Slug, CancellationToken.None);
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt });
        })
        .WithName("UnpublishRecipe")
        .RequireRateLimiting("recipe-write")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Há»§y xuáº¥t báº£n cÃ´ng thá»©c vÃ  chuyá»ƒn vá» báº£n nhÃ¡p")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict);

        // FR-RCP-002: Xem chi tiáº¿t cÃ´ng thá»©c Ä‘Ã£ xuáº¥t báº£n theo slug
        group.MapGet("/{slug}", async (
            string slug,
            ISender sender,
            HttpContext context,
            CancellationToken ct) =>
        {
            var recipe = await sender.Send(new GetRecipeBySlugQuery(slug), ct);
            context.Response.Headers.CacheControl = recipe.Status == (int)RecipeStatus.Published
                ? "public, max-age=0, must-revalidate"
                : "no-store";
            context.Response.Headers.ETag = $"\"{recipe.RowVersion}\"";
            return Results.Ok(ApiResponse<RecipeDetailDto>.Ok(recipe));
        })
        .WithName("GetRecipeBySlug")
        .RequireRateLimiting("recipe-read")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Láº¥y chi tiáº¿t cÃ´ng thá»©c theo slug; khÃ¡ch chá»‰ xem Published, Owner/Admin xem thÃªm Draft vÃ  Archived (FR-RCP-002)")
        .Produces<ApiResponse<RecipeDetailDto>>(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound);

        // ============================================================
        // POST - FR-RCP-003: Táº¡o cÃ´ng thá»©c má»›i (tá»« Báº£o TrÃ¢m)
        // ============================================================
        group.MapPost("/", async (
            CreateRecipeRequest request,
            ISender sender,
            CancellationToken ct) =>
        {
            var result = await sender.Send(new CreateRecipeCommand(
                request.Title, request.Description, request.Instructions, request.PrepTime,
                request.CookTime, request.Servings, request.Difficulty, request.CategoryId,
                request.Ingredients?.Select(x => x is null ? null : new NewRecipeIngredient(
                    x.Name, x.Quantity, x.Unit, x.Notes)).ToArray(),
                request.Steps?.Select(x => x is null ? null : new NewRecipeStep(
                    x.Description, x.Title, x.TimerMinutes, x.ImageUrl)).ToArray(),
                request.Nutrition is { } n ? new NewRecipeNutrition(
                    n.Calories, n.Protein, n.Carbohydrates, n.Fat, n.Fiber, n.Sodium) : null), ct);
            DiagnosticsConfig.RecipeCreatedCounter.Add(1);
            return Results.Created(
                $"/api/v1/recipes/{result.Slug}",
                ApiResponse<CreatedRecipe>.Ok(result));
        })
        .RequireAuthorization("AuthorPolicy")
        .WithName("CreateRecipe")
        .WithSummary("Táº¡o cÃ´ng thá»©c má»›i - Author/Admin")
        .Produces<ApiResponse<CreatedRecipe>>(StatusCodes.Status201Created)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        // ============================================================
        // PUT - FR-RCP-004: Cáº­p nháº­t cÃ´ng thá»©c (tá»« Báº£o TrÃ¢m)
        // ============================================================
        group.MapPut("/{id:guid}", async (
            Guid id,
            UpdateRecipeRequest request,
            HttpContext httpContext,
            ISender sender,
            CancellationToken ct) =>
        {
            var result = await sender.Send(new CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipe.UpdateRecipeCommand(
                id, request.Title, request.Description, request.Instructions, request.PrepTime,
                request.CookTime, request.Servings, request.Difficulty, request.CategoryId,
                request.RowVersion, httpContext.Request.Headers.IfMatch.ToString()), ct);
            httpContext.Response.Headers.ETag = $"\"{result.RowVersion}\"";
            httpContext.Response.Headers.CacheControl = "no-store";
            return Results.Ok(ApiResponse<UpdatedRecipe>.Ok(result));
        })
        .RequireAuthorization("AuthorPolicy")
        .WithName("UpdateRecipe")
        .WithSummary("Cáº­p nháº­t cÃ´ng thá»©c - Author/Admin")
        .Produces(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        return app;
    }

    private static string GenerateSlug(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return $"recipe-{Guid.NewGuid():N}";

        var normalized = text.Trim().ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD);
        var result = new System.Text.StringBuilder();

        foreach (var c in normalized)
        {
            var category = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
            if (category == System.Globalization.UnicodeCategory.NonSpacingMark)
                continue;

            if (char.IsLetterOrDigit(c))
                result.Append(c);
            else
                result.Append('-');
        }

        var slug = result.ToString();
        while (slug.Contains("--"))
        {
            slug = slug.Replace("--", "-");
        }

        slug = slug.Trim('-');
        return string.IsNullOrWhiteSpace(slug)
            ? $"recipe-{Guid.NewGuid():N}"
            : slug;
    }

    private static async Task<string> GenerateUniqueSlugAsync(
        string baseSlug,
        IRecipeRepository recipes,
        CancellationToken ct)
    {
        var slug = baseSlug;
        var suffix = 2;
        while (await recipes.ExistsBySlugAsync(slug, ct))
        {
            slug = $"{baseSlug}-{suffix++}";
        }

        return slug;
    }


}

public sealed record CreateRecipeRequest(
    string Title,
    string? Description,
    string? Instructions,
    int PrepTime,
    int CookTime,
    int Servings,
    RecipeDifficulty Difficulty,
    Guid CategoryId,
    IReadOnlyList<CreateRecipeIngredientRequest>? Ingredients = null,
    IReadOnlyList<CreateRecipeStepRequest>? Steps = null,
    CreateRecipeNutritionRequest? Nutrition = null
);

public sealed record CreateRecipeIngredientRequest(
    string Name,
    decimal? Quantity = null,
    string? Unit = null,
    string? Notes = null);

public sealed record CreateRecipeStepRequest(
    string Description,
    string? Title = null,
    int? TimerMinutes = null,
    string? ImageUrl = null);

public sealed record CreateRecipeNutritionRequest(
    decimal? Calories = null,
    decimal? Protein = null,
    decimal? Carbohydrates = null,
    decimal? Fat = null,
    decimal? Fiber = null,
    decimal? Sodium = null);

public sealed record UpdateRecipeRequest(
    string Title,
    string? Description,
    string? Instructions,
    int PrepTime,
    int CookTime,
    int Servings,
    RecipeDifficulty Difficulty,
    Guid CategoryId,
    string? RowVersion = null
);
