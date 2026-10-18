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
using CulinaryBlog.Application.Features.Recipes.Commands.UploadRecipeImage;
using CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipeImage;
using CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipe;
using CulinaryBlog.Application.Features.Recipes.Commands.CreateRecipe;
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
        .WithSummary("Lấy bộ sưu tập ảnh của công thức (Owner/Admin)")
        .RequireAuthorization("AuthorPolicy")
        .Produces<ApiResponse<IReadOnlyList<RecipeImageDto>>>(StatusCodes.Status200OK)
        .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404);

        group.MapPatch("/{recipeId:guid}/images/{imageId:guid}/primary", async (
            Guid recipeId, Guid imageId, ISender sender, CancellationToken ct) =>
            Results.Ok(ApiResponse<RecipeImageDto>.Ok(
                await sender.Send(new SetRecipeImagePrimaryCommand(recipeId, imageId), ct))))
        .WithName("SetRecipeImagePrimary")
        .WithSummary("Đặt ảnh chính duy nhất cho công thức")
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
                throw new ValidationException("file", "Vui lòng chọn ảnh cần tải lên.");
            await using var stream = file.OpenReadStream();
            var image = await sender.Send(new UploadRecipeImageCommand(
                recipeId, stream, file.FileName, file.ContentType, file.Length, altText), ct);
            return Results.Created($"/api/v1/recipes/{recipeId}/images/{image.Id}",
                ApiResponse<RecipeImageDto>.Ok(image, "Tải ảnh thành công; các kích thước khác đang được xử lý."));
        })
        .WithName("UploadRecipeImage")
        .WithSummary("Tải ảnh công thức lên MinIO")
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
        .WithSummary("Xóa ảnh công thức và dọn các object khỏi MinIO (FR-FILE-002)")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .RequireAuthorization("AuthorPolicy");

        // FR-RCP-007: Soft delete công thức. Ảnh MinIO được giữ lại để PurgeDeletedRecipesJob
        // dọn sau 30 ngày.
        group.MapDelete("/{id:guid}", async (
            Guid id,
            ISender sender,
            CancellationToken ct) =>
        {
            await sender.Send(new DeleteRecipeCommand(id), ct);
            return Results.NoContent();
        })
        .WithName("DeleteRecipe")
        .WithSummary("Xóa mềm công thức; ảnh được giữ lại để dọn sau 30 ngày (FR-RCP-007)")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
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
        .WithSummary("Lấy trạng thái xử lý ảnh công thức")
        .Produces<ApiResponse<RecipeImageDto>>(StatusCodes.Status200OK)
        .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404)
        .RequireAuthorization("AuthorPolicy");

        // FR-RCP-001: Xem Danh sách Công thức Công cộng (Paginated + Filtered)
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
        .WithSummary("Lấy danh sách công thức đã xuất bản kèm phân trang và lọc (FR-RCP-001)")
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
            context.Response.Headers.ETag = $"\"{detail.RowVersion}\"";
            return Results.Ok(detail);
        })
        .WithName("GetRecipeById")
        .RequireRateLimiting("recipe-read")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Lấy chi tiết công thức theo ID; Owner/Admin xem được Draft và Archived")
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
        .WithSummary("Lấy danh sách công thức của tác giả hoặc toàn bộ công thức cho Admin")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden);

        // FR-SRCH-001: Tìm kiếm toàn văn bản công thức nấu ăn
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
        .WithSummary("Tìm kiếm toàn văn bản công thức nấu ăn (FR-SRCH-001)")
        .Produces<ApiResponse<PagedResult<SearchRecipeSummaryDto>>>(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status422UnprocessableEntity);

        // FR-RCP-006: Lưu trữ công thức
        group.MapPatch("/{id:guid}/archive", async (
            Guid id,
            IRecipeRepository recipeRepo,
            ICurrentUserService currentUser,
            IUnitOfWork unitOfWork,
            CancellationToken ct) =>
        {
            var recipe = await recipeRepo.GetDetailsByIdAsync(id, ct);
            if (recipe is null || recipe.IsDeleted)
                throw new NotFoundException("Recipe", id);

            if (!currentUser.IsAdmin && recipe.AuthorId != currentUser.UserId)
                throw new ForbiddenException();

            recipe.Archive();
            await unitOfWork.SaveChangesAsync(ct);
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt, recipe.UpdatedAt });
        })
        .WithName("ArchiveRecipe")
        .RequireRateLimiting("recipe-write")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Lưu trữ công thức, giữ nguyên dữ liệu và ẩn khỏi danh sách công khai")
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
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt, recipe.UpdatedAt });
        })
        .WithName("UnarchiveRecipe")
        .RequireRateLimiting("recipe-write")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Khôi phục công thức đã lưu trữ về bản nháp")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict);

        // FR-RCP-005: Xuất bản công thức
        group.MapPatch("/{id:guid}/publish", async (
            Guid id,
            IRecipeRepository recipeRepo,
            ICurrentUserService currentUser,
            ApplicationDbContext db,
            CancellationToken ct) =>
        {
            var recipe = await recipeRepo.GetDetailsByIdAsync(id, ct);
            if (recipe is null || recipe.IsDeleted)
                throw new NotFoundException("Recipe", id);

            if (!currentUser.IsAdmin && recipe.AuthorId != currentUser.UserId)
                throw new ForbiddenException();

            if (recipe.Status == RecipeStatus.Published)
                return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt });

            if (recipe.Status == RecipeStatus.Archived)
                throw new ConflictException("Không thể xuất bản công thức đang lưu trữ. Hãy khôi phục về bản nháp trước.");

            try
            {
                recipe.Publish();
            }
            catch (DomainException ex)
            {
                throw new ValidationException("Steps", ex.Message);
            }

            await db.SaveChangesAsync(ct);
            DiagnosticsConfig.RecipePublishedCounter.Add(1);
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt });
        })
        .WithName("PublishRecipe")
        .RequireRateLimiting("recipe-write")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Xuất bản công thức (yêu cầu ít nhất một bước thực hiện)")
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
                throw new ConflictException("Không thể hủy xuất bản công thức đang lưu trữ.");

            recipe.Unpublish();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt });
        })
        .WithName("UnpublishRecipe")
        .RequireRateLimiting("recipe-write")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Hủy xuất bản công thức và chuyển về bản nháp")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict);

        // FR-RCP-002: Xem chi tiết công thức đã xuất bản theo slug
        group.MapGet("/{slug}", async (
            string slug,
            ISender sender,
            HttpContext context,
            CancellationToken ct) =>
        {
            var recipe = await sender.Send(new GetRecipeBySlugQuery(slug), ct);
            context.Response.Headers.ETag = $"\"{recipe.RowVersion}\"";
            return Results.Ok(recipe);
        })
        .WithName("GetRecipeBySlug")
        .RequireRateLimiting("recipe-read")
        .ProducesProblem(StatusCodes.Status429TooManyRequests)
        .WithSummary("Lấy chi tiết công thức theo slug; khách chỉ xem Published, Owner/Admin xem thêm Draft và Archived (FR-RCP-002)")
        .Produces<RecipeDetailDto>(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound);

        // ============================================================
        // POST - FR-RCP-003: Tạo công thức mới (từ Bảo Trâm)
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
                    x.Description, x.Title, x.TimerMinutes)).ToArray(),
                request.Nutrition is { } n ? new NewRecipeNutrition(
                    n.Calories, n.Protein, n.Carbohydrates, n.Fat, n.Fiber, n.Sodium) : null), ct);
            DiagnosticsConfig.RecipeCreatedCounter.Add(1);
            return Results.Created(
                $"/api/v1/recipes/{result.Slug}",
                ApiResponse<CreatedRecipe>.Ok(result));
        })
        .RequireAuthorization("AuthorPolicy")
        .WithName("CreateRecipe")
        .WithSummary("Tạo công thức mới - Author/Admin")
        .Produces<ApiResponse<CreatedRecipe>>(StatusCodes.Status201Created)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        // ============================================================
        // PUT - FR-RCP-004: Cập nhật công thức (từ Bảo Trâm)
        // ============================================================
        group.MapPut("/{id:guid}", async (
            Guid id,
            UpdateRecipeRequest request,
            HttpContext httpContext,
            IUnitOfWork unitOfWork,
            ApplicationDbContext db,
            CancellationToken ct) =>
        {
            var currentUserId = httpContext.User.FindFirstValue(ClaimTypes.NameIdentifier);

            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                throw new UnauthorizedAccessException("Không xác định được người dùng đăng nhập.");
            }

            var recipe = await unitOfWork.Recipes.GetDetailsByIdAsync(id, ct);
            if (recipe is null)
            {
                throw new NotFoundException("Recipe", id);
            }

            var expectedRowVersion = ParseExpectedRowVersion(
                request.RowVersion,
                httpContext.Request.Headers.IfMatch.ToString());
            if (expectedRowVersion is null || expectedRowVersion.Length == 0)
            {
                throw new ValidationException(
                    "RowVersion",
                    "RowVersion hoặc If-Match là bắt buộc khi cập nhật công thức.");
            }

            db.Entry(recipe).Property(entity => entity.RowVersion).OriginalValue = expectedRowVersion;

            bool isAdmin = httpContext.User.IsInRole("Admin");
            if (!isAdmin && !string.Equals(recipe.AuthorId, currentUserId, StringComparison.Ordinal))
            {
                throw new ForbiddenException("Bạn chỉ được cập nhật công thức do chính mình tạo.");
            }

            if (string.IsNullOrWhiteSpace(request.Title))
            {
                throw new ValidationException("Title", "Tên công thức không được để trống.");
            }

            if (request.Title.Trim().Length < 3)
            {
                throw new ValidationException("Title", "Tên công thức phải có ít nhất 3 ký tự.");
            }

            var title = request.Title.Trim();
            if (title.Length > 200)
            {
                throw new ValidationException("Title", "Title must not exceed 200 characters.");
            }

            var description = request.Description?.Trim() ?? string.Empty;
            if (description.Length > 2000)
            {
                throw new ValidationException("Description", "Description must not exceed 2000 characters.");
            }

            var instructions = request.Instructions?.Trim();
            if (instructions?.Length > 10000)
            {
                throw new ValidationException("Instructions", "Instructions must not exceed 10000 characters.");
            }
            if (request.Servings <= 0)
            {
                throw new ValidationException("Servings", "Số khẩu phần phải lớn hơn 0.");
            }

            if (request.PrepTime < 0)
            {
                throw new ValidationException("PrepTime", "Thời gian chuẩn bị không được âm.");
            }

            if (request.CookTime < 0)
            {
                throw new ValidationException("CookTime", "Thời gian nấu không được âm.");
            }

            if (request.CategoryId == Guid.Empty)
            {
                throw new ValidationException("CategoryId", "CategoryId is required.");
            }

            var category = await unitOfWork.Categories.GetByIdAsync(request.CategoryId, ct);
            if (category is null)
            {
                throw new NotFoundException("Category", request.CategoryId);
            }

            recipe.Update(
                title,
                description,
                instructions,
                request.PrepTime,
                request.CookTime,
                request.Servings,
                request.Difficulty,
                request.CategoryId);

            await unitOfWork.SaveChangesAsync(ct);

            httpContext.Response.Headers.ETag = $"\"{Convert.ToBase64String(recipe.RowVersion)}\"";

            return Results.Ok(new
            {
                message = "Cập nhật công thức thành công.",
                id = recipe.Id,
                slug = recipe.Slug,
                rowVersion = Convert.ToBase64String(recipe.RowVersion)
            });
        })
        .RequireAuthorization("AuthorPolicy")
        .WithName("UpdateRecipe")
        .WithSummary("Cập nhật công thức - Author/Admin")
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

    private static byte[]? ParseExpectedRowVersion(string? requestVersion, string? ifMatch)
    {
        var value = !string.IsNullOrWhiteSpace(requestVersion)
            ? requestVersion.Trim()
            : ifMatch?.Trim().Trim('"');

        if (string.IsNullOrWhiteSpace(value) || value == "*")
        {
            return null;
        }

        try
        {
            return Convert.FromBase64String(value);
        }
        catch (FormatException)
        {
            throw new ValidationException("RowVersion", "RowVersion/If-Match không đúng định dạng Base64.");
        }
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
    int? TimerMinutes = null);

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
