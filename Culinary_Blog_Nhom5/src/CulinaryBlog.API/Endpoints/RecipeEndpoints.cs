using System;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Recipes.Queries.SearchRecipes;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace CulinaryBlog.API.Endpoints;

public static class RecipeEndpoints
{
    public static IEndpointRouteBuilder MapRecipeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/recipes")
            .WithTags("Recipes");

        // FR-RCP-001: Xem Danh sách Công thức (Paginated + Filtered)
        group.MapGet("/", async (
            int? page,
            int? pageSize,
            Guid? categoryId,
            string? sortBy,
            IRecipeRepository recipeRepo) =>
        {
            int p = page.GetValueOrDefault(1);
            int ps = pageSize.GetValueOrDefault(12);
            var (items, totalCount) = await recipeRepo.GetPagedAsync(p, ps, categoryId: categoryId, sortBy: sortBy);
            return Results.Ok(new
            {
                items,
                totalCount,
                page = p,
                pageSize = ps
            });
        })
        .WithName("GetRecipes")
        .WithSummary("Lấy danh sách công thức đã xuất bản kèm phân trang và lọc");

        group.MapGet("/search", async (
            [AsParameters] SearchRecipesQuery query,
            ISender sender,
            CancellationToken ct) =>
        {
            var response = await sender.Send(query, ct);
            return Results.Ok(response);
        })
        .WithName("SearchRecipes")
        .WithSummary("Tìm kiếm toàn văn bản công thức nấu ăn (FR-SRCH-001)")
        .Produces<ApiResponse<PagedResult<RecipeSummaryDto>>>(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status422UnprocessableEntity);

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

        return app;
    }
}
