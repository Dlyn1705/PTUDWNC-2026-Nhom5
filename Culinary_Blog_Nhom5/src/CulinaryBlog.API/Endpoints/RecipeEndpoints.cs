using System;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Recipes.Queries.SearchRecipes;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeBySlug;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace CulinaryBlog.API.Endpoints;

public static class RecipeEndpoints
{
    public static IEndpointRouteBuilder MapRecipeEndpoints(
        this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/recipes")
            .WithTags("Recipes");

        // ============================================================
        // FR-RCP-001: DANH SÁCH CÔNG THỨC
        // ============================================================
        group.MapGet("/", async (
            int? page,
            int? pageSize,
            Guid? categoryId,
            RecipeDifficulty? difficulty,
            int? maxCookTime,
            string? sortBy,
            IRecipeRepository recipeRepo,
            CancellationToken ct) =>
        {
            int p = page.GetValueOrDefault(1);
            int ps = pageSize.GetValueOrDefault(12);

            if (p < 1)
                p = 1;

            if (ps < 1)
                ps = 12;

            if (ps > 100)
                ps = 100;

            var (items, totalCount) =
                await recipeRepo.GetPagedAsync(
                    p,
                    ps,
                    categoryId,
                    difficulty,
                    maxCookTime,
                    sortBy,
                    ct: ct);

            var result = items.Select(recipe => new
{
    id = recipe.Id,
    title = recipe.Title,
    slug = recipe.Slug,
    createdAt = recipe.CreatedAt,
    description = recipe.Description,
    prepTimeMinutes = recipe.PrepTime,
    cookTimeMinutes = recipe.CookTime,
    servings = recipe.Servings,
    difficulty = recipe.Difficulty,
    status = recipe.Status,
    categoryId = recipe.CategoryId,
    categoryName = recipe.Category?.Name,
    categorySlug = recipe.Category?.Slug,
    author = recipe.Author == null
        ? null
        : new
        {
            id = recipe.Author.Id,
            displayName = recipe.Author.DisplayName,
            avatarUrl = recipe.Author.AvatarUrl
        },
    images = recipe.Images
        .Where(x => !x.IsDeleted)
        .Select(x => new
        {
            id = x.Id,
            originalUrl = x.OriginalUrl,
            thumbnailUrl = x.ThumbnailUrl,
            mediumUrl = x.MediumUrl,
            altText = x.AltText,
            isPrimary = x.IsPrimary
        })
        .ToList()
}).ToList();

return Results.Ok(new
{
    items = result,
    totalCount,
    page = p,
    pageSize = ps,
    totalPages = (int)Math.Ceiling(totalCount / (double)ps),
    hasNextPage = p * ps < totalCount,
    hasPreviousPage = p > 1
});
        })
        .WithName("GetRecipes")
        .WithSummary("Lấy danh sách công thức đã xuất bản");


        // ============================================================
        // FR-SRCH-001: TÌM KIẾM CÔNG THỨC
        // Phải đặt trước /{slug}
        // ============================================================
        group.MapGet("/search", async (
            [AsParameters] SearchRecipesQuery query,
            ISender sender,
            CancellationToken ct) =>
        {
            var response = await sender.Send(query, ct);

            return Results.Ok(response);
        })
        .WithName("SearchRecipes")
        .WithSummary("Tìm kiếm toàn văn bản công thức nấu ăn")
        .Produces<ApiResponse<PagedResult<SearchRecipeSummaryDto>>>(
            StatusCodes.Status200OK)
        .Produces<ProblemDetails>(
            StatusCodes.Status422UnprocessableEntity);


       // ============================================================
// FR-RCP-002: CHI TIẾT CÔNG THỨC
// ============================================================
group.MapGet("/{slug}", async (
    string slug,
    ISender sender,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(slug))
    {
        throw new ValidationException(
            "Slug",
            "Slug không được để trống.");
    }

    var query = new GetRecipeBySlugQuery(slug);

    var result = await sender.Send(query, ct);

    return Results.Ok(result);
})
.WithName("GetRecipeBySlug")
.WithSummary("Lấy chi tiết công thức theo slug")
.Produces<RecipeDetailDto>(StatusCodes.Status200OK)
.ProducesProblem(StatusCodes.Status404NotFound)
.ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        // ============================================================
        // FR-RCP-003: TẠO CÔNG THỨC MỚI
        //
        // Phân quyền:
        // - Author: được tạo
        // - Admin: được tạo
        // - User thường: bị 403
        // - Chưa đăng nhập: bị 401
        // ============================================================
        group.MapPost("/", async (
            CreateRecipeRequest request,
            HttpContext httpContext,
            IUnitOfWork unitOfWork,
            CancellationToken ct) =>
        {
            // --------------------------------------------------------
            // 1. Kiểm tra đăng nhập
            // --------------------------------------------------------
            var authorId =
                httpContext.User.FindFirstValue(
                    ClaimTypes.NameIdentifier);

            if (string.IsNullOrWhiteSpace(authorId))
            {
                throw new UnauthorizedAccessException(
                    "Bạn phải đăng nhập để tạo công thức.");
            }


            // --------------------------------------------------------
            // 2. Kiểm tra quyền Author/Admin
            // --------------------------------------------------------
            bool isAuthor =
                httpContext.User.IsInRole("Author");

            bool isAdmin =
                httpContext.User.IsInRole("Admin");

            if (!isAuthor && !isAdmin)
            {
                throw new ForbiddenException(
                    "Chỉ Author hoặc Admin mới được tạo công thức.");
            }


            // --------------------------------------------------------
            // 3. Validate Title
            // --------------------------------------------------------
            if (string.IsNullOrWhiteSpace(request.Title))
            {
                throw new ValidationException(
                    "Title",
                    "Tên công thức không được để trống.");
            }

            var title = request.Title.Trim();

            if (title.Length < 3)
            {
                throw new ValidationException(
                    "Title",
                    "Tên công thức phải có ít nhất 3 ký tự.");
            }

            if (title.Length > 200)
            {
                throw new ValidationException(
                    "Title",
                    "Tên công thức không được vượt quá 200 ký tự.");
            }


            // --------------------------------------------------------
            // 4. Validate Description
            // --------------------------------------------------------
            var description =
                request.Description?.Trim() ?? string.Empty;

            if (description.Length > 2000)
            {
                throw new ValidationException(
                    "Description",
                    "Mô tả không được vượt quá 2000 ký tự.");
            }


            // --------------------------------------------------------
            // 5. Validate Instructions
            // --------------------------------------------------------
            var instructions =
                request.Instructions?.Trim() ?? string.Empty;

            if (instructions.Length > 10000)
            {
                throw new ValidationException(
                    "Instructions",
                    "Hướng dẫn không được vượt quá 10000 ký tự.");
            }


            // --------------------------------------------------------
            // 6. Validate PrepTime
            // --------------------------------------------------------
            if (request.PrepTime < 0)
            {
                throw new ValidationException(
                    "PrepTime",
                    "Thời gian chuẩn bị không được âm.");
            }


            // --------------------------------------------------------
            // 7. Validate CookTime
            // --------------------------------------------------------
            if (request.CookTime < 0)
            {
                throw new ValidationException(
                    "CookTime",
                    "Thời gian nấu không được âm.");
            }


            // --------------------------------------------------------
            // 8. Validate Servings
            // --------------------------------------------------------
            if (request.Servings <= 0)
            {
                throw new ValidationException(
                    "Servings",
                    "Số khẩu phần phải lớn hơn 0.");
            }


            // --------------------------------------------------------
            // 9. Validate Category
            // --------------------------------------------------------
            if (request.CategoryId == Guid.Empty)
            {
                throw new ValidationException(
                    "CategoryId",
                    "CategoryId không được để trống.");
            }

            var category =
                await unitOfWork.Categories.GetByIdAsync(
                    request.CategoryId,
                    ct);

            if (category is null)
            {
                throw new NotFoundException(
                    "Category",
                    request.CategoryId);
            }


            // --------------------------------------------------------
            // 10. Tạo slug
            // --------------------------------------------------------
            var baseSlug =
                GenerateSlug(title);

            if (string.IsNullOrWhiteSpace(baseSlug))
            {
                baseSlug =
                    $"recipe-{Guid.NewGuid():N}";
            }

            var slug = baseSlug;

            // --------------------------------------------------------
            // 11. Kiểm tra slug trùng
            // --------------------------------------------------------
            int suffix = 1;

            while (
                await unitOfWork.Recipes
                    .ExistsBySlugAsync(slug, ct))
            {
                slug = $"{baseSlug}-{suffix}";
                suffix++;
            }


            // --------------------------------------------------------
            // 12. Tạo Recipe Domain Entity
            // --------------------------------------------------------
            var recipe =
                Recipe.Create(
                    title,
                    slug,
                    description,
                    instructions,
                    request.PrepTime,
                    request.CookTime,
                    request.Servings,
                    request.Difficulty,
                    request.CategoryId,
                    authorId);


            // --------------------------------------------------------
            // 13. Thêm Recipe vào Repository
            // --------------------------------------------------------
            await unitOfWork.Recipes.AddAsync(
                recipe,
                ct);


            // --------------------------------------------------------
            // 14. Lưu Database
            // --------------------------------------------------------
            await unitOfWork.SaveChangesAsync(ct);


            // --------------------------------------------------------
            // 15. Trả kết quả
            // --------------------------------------------------------
            return Results.Created(
                $"/api/v1/recipes/{recipe.Slug}",
                new
                {
                    message = "Tạo công thức thành công.",
                    id = recipe.Id,
                    title = recipe.Title,
                    slug = recipe.Slug,
                    status = recipe.Status.ToString(),
                    categoryId = recipe.CategoryId,
                    authorId = recipe.AuthorId
                });
        })
        .RequireAuthorization()
        .WithName("CreateRecipe")
        .WithSummary(
            "Tạo công thức mới - Author/Admin")
        .Produces(StatusCodes.Status201Created)
        .ProducesProblem(StatusCodes.Status400BadRequest)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound);


        // ============================================================
        // FR-RCP-004: CẬP NHẬT CÔNG THỨC
        // ============================================================
        group.MapPut("/{id:guid}", async (
            Guid id,
            UpdateRecipeRequest request,
            HttpContext httpContext,
            IUnitOfWork unitOfWork,
            CancellationToken ct) =>
        {
            // --------------------------------------------------------
            // 1. Lấy UserId
            // --------------------------------------------------------
            var currentUserId =
                httpContext.User.FindFirstValue(
                    ClaimTypes.NameIdentifier);

            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                throw new UnauthorizedAccessException(
                    "Bạn phải đăng nhập.");
            }


            // --------------------------------------------------------
            // 2. Tìm Recipe
            // --------------------------------------------------------
            var recipe =
                await unitOfWork.Recipes
                    .GetDetailsByIdAsync(id, ct);

            if (recipe is null)
            {
                throw new NotFoundException(
                    "Recipe",
                    id);
            }


            // --------------------------------------------------------
            // 3. Kiểm tra quyền
            // --------------------------------------------------------
            bool isAdmin =
                httpContext.User.IsInRole("Admin");

            bool isAuthor =
                httpContext.User.IsInRole("Author");

            if (!isAdmin && !isAuthor)
            {
                throw new ForbiddenException(
                    "Bạn không có quyền cập nhật công thức.");
            }


            // Author chỉ sửa recipe của chính mình
            if (!isAdmin &&
                !string.Equals(
                    recipe.AuthorId,
                    currentUserId,
                    StringComparison.Ordinal))
            {
                throw new ForbiddenException(
                    "Bạn chỉ được cập nhật công thức do chính mình tạo.");
            }


            // --------------------------------------------------------
            // 4. Validate
            // --------------------------------------------------------
            if (string.IsNullOrWhiteSpace(request.Title))
            {
                throw new ValidationException(
                    "Title",
                    "Tên công thức không được để trống.");
            }

            var title = request.Title.Trim();

            if (title.Length < 3)
            {
                throw new ValidationException(
                    "Title",
                    "Tên công thức phải có ít nhất 3 ký tự.");
            }

            if (request.Servings <= 0)
            {
                throw new ValidationException(
                    "Servings",
                    "Số khẩu phần phải lớn hơn 0.");
            }

            if (request.PrepTime < 0)
            {
                throw new ValidationException(
                    "PrepTime",
                    "Thời gian chuẩn bị không được âm.");
            }

            if (request.CookTime < 0)
            {
                throw new ValidationException(
                    "CookTime",
                    "Thời gian nấu không được âm.");
            }


            // --------------------------------------------------------
            // 5. Kiểm tra Category
            // --------------------------------------------------------
            if (request.CategoryId == Guid.Empty)
            {
                throw new ValidationException(
                    "CategoryId",
                    "CategoryId không được để trống.");
            }

            var category =
                await unitOfWork.Categories.GetByIdAsync(
                    request.CategoryId,
                    ct);

            if (category is null)
            {
                throw new NotFoundException(
                    "Category",
                    request.CategoryId);
            }


            // --------------------------------------------------------
            // 6. Update
            // --------------------------------------------------------
            recipe.Update(
                title,
                request.Description?.Trim() ?? string.Empty,
                request.Instructions?.Trim() ?? string.Empty,
                request.PrepTime,
                request.CookTime,
                request.Servings,
                request.Difficulty,
                request.CategoryId);


            unitOfWork.Recipes.Update(recipe);

            await unitOfWork.SaveChangesAsync(ct);


            // --------------------------------------------------------
            // 7. Response
            // --------------------------------------------------------
            return Results.Ok(new
            {
                message = "Cập nhật công thức thành công.",
                id = recipe.Id,
                title = recipe.Title,
                slug = recipe.Slug,
                status = recipe.Status.ToString()
            });
        })
        .RequireAuthorization()
        .WithName("UpdateRecipe")
        .WithSummary(
            "Cập nhật công thức - Author/Admin")
        .Produces(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound);

// ============================================================
// FR-RCP-007: XÓA CÔNG THỨC
// ============================================================
group.MapDelete("/{id:guid}", async (
    Guid id,
    HttpContext httpContext,
    IUnitOfWork unitOfWork,
    CancellationToken ct) =>
{
    // --------------------------------------------------------
    // 1. Lấy UserId
    // --------------------------------------------------------
    var currentUserId =
        httpContext.User.FindFirstValue(
            ClaimTypes.NameIdentifier);

    if (string.IsNullOrWhiteSpace(currentUserId))
    {
        throw new UnauthorizedAccessException(
            "Bạn phải đăng nhập.");
    }

    // --------------------------------------------------------
    // 2. Tìm Recipe
    // --------------------------------------------------------
    var recipe =
        await unitOfWork.Recipes
            .GetDetailsByIdAsync(id, ct);

    if (recipe is null)
    {
        throw new NotFoundException(
            "Recipe",
            id);
    }

    // --------------------------------------------------------
    // 3. Kiểm tra quyền
    // --------------------------------------------------------
    bool isAdmin =
        httpContext.User.IsInRole("Admin");

    bool isAuthor =
        httpContext.User.IsInRole("Author");

    if (!isAdmin && !isAuthor)
    {
        throw new ForbiddenException(
            "Bạn không có quyền xóa công thức.");
    }

    // --------------------------------------------------------
    // 4. Author chỉ được xóa công thức của chính mình
    // --------------------------------------------------------
    if (!isAdmin &&
        !string.Equals(
            recipe.AuthorId,
            currentUserId,
            StringComparison.Ordinal))
    {
        throw new ForbiddenException(
            "Bạn chỉ được xóa công thức do chính mình tạo.");
    }

    // --------------------------------------------------------
    // 5. Soft Delete
    // --------------------------------------------------------
    recipe.IsDeleted = true;
    recipe.UpdatedAt = DateTime.UtcNow;

    // --------------------------------------------------------
    // 6. Cập nhật Database
    // --------------------------------------------------------
    unitOfWork.Recipes.Update(recipe);

    await unitOfWork.SaveChangesAsync(ct);

    // --------------------------------------------------------
    // 7. Response
    // --------------------------------------------------------
    return Results.Ok(new
    {
        message = "Xóa công thức thành công.",
        id = recipe.Id,
        isDeleted = recipe.IsDeleted
    });
})
.RequireAuthorization()
.WithName("DeleteRecipe")
.WithSummary("Xóa công thức - Author/Admin")
.Produces(StatusCodes.Status200OK)
.ProducesProblem(StatusCodes.Status401Unauthorized)
.ProducesProblem(StatusCodes.Status403Forbidden)
.ProducesProblem(StatusCodes.Status404NotFound);
        return app;
    }


    // ================================================================
    // Generate Slug
    // ================================================================
    private static string GenerateSlug(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var normalized =
            text.Trim()
                .ToLowerInvariant()
                .Normalize(
                    System.Text.NormalizationForm.FormD);

        var result =
            new System.Text.StringBuilder();

        foreach (var c in normalized)
        {
            var category =
                System.Globalization.CharUnicodeInfo
                    .GetUnicodeCategory(c);

            if (category ==
                System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(c))
            {
                result.Append(c);
            }
            else
            {
                if (result.Length == 0 ||
                    result[^1] != '-')
                {
                    result.Append('-');
                }
            }
        }

        return result
            .ToString()
            .Trim('-');
    }
}


// ====================================================================
// REQUEST MODELS
// ====================================================================

public sealed record CreateRecipeRequest(
    string Title,
    string? Description,
    string? Instructions,
    int PrepTime,
    int CookTime,
    int Servings,
    RecipeDifficulty Difficulty,
    Guid CategoryId
);


public sealed record UpdateRecipeRequest(
    string Title,
    string? Description,
    string? Instructions,
    int PrepTime,
    int CookTime,
    int Servings,
    RecipeDifficulty Difficulty,
    Guid CategoryId
);