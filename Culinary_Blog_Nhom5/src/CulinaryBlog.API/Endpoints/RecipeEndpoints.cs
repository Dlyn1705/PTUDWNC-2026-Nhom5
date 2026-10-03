using System;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Recipes.Queries.GetPublicRecipes;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeBySlug;
using CulinaryBlog.Application.Features.Recipes.Queries.SearchRecipes;
using CulinaryBlog.Application.Contracts;
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
        var group = app.MapGroup("/api/v1/recipes")
            .WithTags("Recipes");

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
        .WithSummary("Lấy danh sách công thức đã xuất bản kèm phân trang và lọc (FR-RCP-001)")
        .Produces<PagedResult<RecipeSummaryDto>>(StatusCodes.Status200OK);

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

            return Results.Ok(new { items, totalCount, page = p, pageSize = ps });
        })
        .WithName("GetManagedRecipes")
        .WithSummary("Lấy danh sách công thức của tác giả hoặc toàn bộ công thức cho Admin")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden);

        group.MapGet("/search", async (
            [AsParameters] SearchRecipesQuery query,
            ISender sender,
            HttpContext context,
            CancellationToken ct) =>
        {
            var response = await sender.Send(query, ct);
            context.Response.Headers.CacheControl = "public, max-age=60";
            return Results.Ok(response);
        })
        .WithName("SearchRecipes")
        .WithSummary("Tìm kiếm toàn văn bản công thức nấu ăn (FR-SRCH-001)")
        .Produces<ApiResponse<PagedResult<SearchRecipeSummaryDto>>>(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status422UnprocessableEntity);

        // FR-RCP-006: Archive keeps recipe and child data in PostgreSQL, but removes it
        // from public listings because those only include Published recipes.
        group.MapPost("/{id:guid}/archive", async (
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
        .WithSummary("Lưu trữ công thức, giữ nguyên dữ liệu và ẩn khỏi danh sách công khai")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict);

        group.MapPost("/{id:guid}/restore", async (
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
        .WithName("RestoreRecipe")
        .WithSummary("Khôi phục công thức đã lưu trữ về bản nháp")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict);

        // FR-RCP-005: Chỉ tác giả sở hữu công thức hoặc Admin được đổi trạng thái.
        group.MapPost("/{id:guid}/publish", async (
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
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt });
        })
        .WithName("PublishRecipe")
        .WithSummary("Xuất bản công thức (yêu cầu ít nhất một bước thực hiện)")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict)
        .Produces<ProblemDetails>(StatusCodes.Status422UnprocessableEntity);

        group.MapPost("/{id:guid}/unpublish", async (
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
        .WithSummary("Hủy xuất bản công thức và chuyển về bản nháp")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict);
        // FR-RCP-002: Xem chi tiết công thức đã xuất bản (Public)
        group.MapGet("/{slug}", async (
            string slug,
            ISender sender,
            CancellationToken ct) =>
        {
            var recipe = await sender.Send(new GetRecipeBySlugQuery(slug), ct);
            return Results.Ok(recipe);
        })
        .WithName("GetRecipeBySlug")
        .WithSummary("Lấy chi tiết công thức đã xuất bản theo slug (FR-RCP-002)")
        .Produces<RecipeDetailDto>(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound);

        return app;
    }
}
