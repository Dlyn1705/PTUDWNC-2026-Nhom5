using System;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Recipes.Queries.GetPublicRecipes;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeBySlug;
using CulinaryBlog.Application.Features.Recipes.Queries.SearchRecipes;
using CulinaryBlog.Domain.Enums;
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
        .Produces<ApiResponse<PagedResult<SearchRecipeSummaryDto>>>(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status422UnprocessableEntity);

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
