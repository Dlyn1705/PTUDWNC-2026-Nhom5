using System;
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
        // GET - FR-RCP-001: Danh sách công thức
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

            return Results.Ok(new
            {
                items,
                totalCount,
                page = p,
                pageSize = ps
            });
        })
        .WithName("GetRecipes")
        .WithSummary("Lấy danh sách công thức đã xuất bản");


        // ============================================================
        // GET - FR-SRCH-001: Tìm kiếm công thức
        // QUAN TRỌNG: phải đặt TRƯỚC /{slug}
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
        // GET - FR-RCP-002: Chi tiết công thức
        // ============================================================
        group.MapGet("/{slug}", async (
            string slug,
            IRecipeRepository recipeRepo,
            CancellationToken ct) =>
        {
            var recipe = await recipeRepo.GetBySlugAsync(slug, ct);

            if (recipe is null)
            {
                throw new NotFoundException("Recipe", slug);
            }

            return Results.Ok(recipe);
        })
        .WithName("GetRecipeBySlug")
        .WithSummary("Lấy chi tiết công thức theo slug");


        // ============================================================
        // POST - FR-RCP-003: Tạo công thức mới
        // ============================================================
        group.MapPost("/", async (
            CreateRecipeRequest request,
            HttpContext httpContext,
            IUnitOfWork unitOfWork,
            CancellationToken ct) =>
        {
            var authorId =
                httpContext.User.FindFirstValue(
                    ClaimTypes.NameIdentifier);

            if (string.IsNullOrWhiteSpace(authorId))
            {
                throw new UnauthorizedAccessException(
                    "Không xác định được người dùng đăng nhập.");
            }

            if (string.IsNullOrWhiteSpace(request.Title))
            {
                throw new ValidationException(
                    "Title",
                    "Tên công thức không được để trống.");
            }

            if (request.Title.Trim().Length < 3)
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

            var slug = GenerateSlug(request.Title);

            if (await unitOfWork.Recipes.ExistsBySlugAsync(slug, ct))
            {
                slug = $"{slug}-{DateTime.UtcNow:yyyyMMddHHmmss}";
            }

            var recipe = Recipe.Create(
                request.Title.Trim(),
                slug,
                request.Description?.Trim() ?? string.Empty,
                request.Instructions?.Trim() ?? string.Empty,
                request.PrepTime,
                request.CookTime,
                request.Servings,
                request.Difficulty,
                request.CategoryId,
                authorId);

            await unitOfWork.Recipes.AddAsync(recipe, ct);

            await unitOfWork.SaveChangesAsync(ct);

            return Results.Created(
                $"/api/v1/recipes/{recipe.Slug}",
                new
                {
                    message = "Tạo công thức thành công.",
                    id = recipe.Id,
                    slug = recipe.Slug
                });
        })
        .RequireAuthorization("AuthorPolicy")
        .WithName("CreateRecipe")
        .WithSummary("Tạo công thức mới - Author/Admin")
        .Produces(StatusCodes.Status201Created)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden);


        // ============================================================
        // PUT - FR-RCP-004: Cập nhật công thức
        // ============================================================
        group.MapPut("/{id:guid}", async (
            Guid id,
            UpdateRecipeRequest request,
            HttpContext httpContext,
            IUnitOfWork unitOfWork,
            CancellationToken ct) =>
        {
            var currentUserId =
                httpContext.User.FindFirstValue(
                    ClaimTypes.NameIdentifier);

            if (string.IsNullOrWhiteSpace(currentUserId))
            {
                throw new UnauthorizedAccessException(
                    "Không xác định được người dùng đăng nhập.");
            }

            var recipe =
                await unitOfWork.Recipes.GetDetailsByIdAsync(
                    id,
                    ct);

            if (recipe is null)
            {
                throw new NotFoundException("Recipe", id);
            }

            bool isAdmin =
                httpContext.User.IsInRole("Admin");

            if (!isAdmin &&
                !string.Equals(
                    recipe.AuthorId,
                    currentUserId,
                    StringComparison.Ordinal))
            {
                throw new ForbiddenException(
                    "Bạn chỉ được cập nhật công thức do chính mình tạo.");
            }

            if (string.IsNullOrWhiteSpace(request.Title))
            {
                throw new ValidationException(
                    "Title",
                    "Tên công thức không được để trống.");
            }

            if (request.Title.Trim().Length < 3)
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

            recipe.Update(
                request.Title.Trim(),
                request.Description?.Trim() ?? string.Empty,
                request.Instructions?.Trim() ?? string.Empty,
                request.PrepTime,
                request.CookTime,
                request.Servings,
                request.Difficulty,
                request.CategoryId);

            unitOfWork.Recipes.Update(recipe);

            await unitOfWork.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                message = "Cập nhật công thức thành công.",
                id = recipe.Id,
                slug = recipe.Slug
            });
        })
        .RequireAuthorization("AuthorPolicy")
        .WithName("UpdateRecipe")
        .WithSummary("Cập nhật công thức - Author/Admin")
        .Produces(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound);


        return app;
    }


    // ================================================================
    // Tạo slug từ Title
    // ================================================================
    private static string GenerateSlug(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return $"recipe-{Guid.NewGuid():N}";

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
                result.Append('-');
            }
        }

        var slug = result.ToString();

        while (slug.Contains("--"))
        {
            slug = slug.Replace("--", "-");
        }

        return slug.Trim('-');
    }
}


// ====================================================================
// Request models
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