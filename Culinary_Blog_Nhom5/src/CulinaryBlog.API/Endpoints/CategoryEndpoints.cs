using System;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Categories.Commands.CreateCategory;
using CulinaryBlog.Application.Features.Categories.Commands.DeleteCategory;
using CulinaryBlog.Application.Features.Categories.Queries.GetCategories;
using CulinaryBlog.Application.Features.Categories.Queries.GetCategoryBySlug;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace CulinaryBlog.API.Endpoints;

public static class CategoryEndpoints
{
    public static IEndpointRouteBuilder MapCategoryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/categories")
            .WithTags("Categories");

        // FR-CAT-001: Xem Danh sách Tất cả Danh mục (Public)
        group.MapGet("/", async (ISender sender) =>
        {
            var result = await sender.Send(new GetCategoriesQuery());
            return Results.Ok(ApiResponse<IReadOnlyList<CategoryDto>>.Ok(result));
        })
        .WithName("GetCategories")
        .WithSummary("Lấy danh sách tất cả danh mục kèm số lượng công thức");

        // FR-CAT-002: Xem chi tiết danh mục và công thức đã xuất bản (Public)
        group.MapGet("/{slug}", async (
            string slug,
            int? page,
            int? pageSize,
            ISender sender) =>
        {
            var currentPage = Math.Max(page.GetValueOrDefault(1), 1);
            var currentPageSize = Math.Clamp(pageSize.GetValueOrDefault(12), 1, 50);
            var result = await sender.Send(
                new GetCategoryBySlugQuery(slug, currentPage, currentPageSize));

            return Results.Ok(new
            {
                data = new
                {
                    category = result.Category,
                    recipes = result.Recipes.Items
                },
                meta = new
                {
                    result.Recipes.Page,
                    result.Recipes.PageSize,
                    result.Recipes.TotalCount,
                    result.Recipes.TotalPages,
                    result.Recipes.HasNextPage,
                    result.Recipes.HasPreviousPage
                }
            });
        })
        .WithName("GetCategoryBySlug")
        .WithSummary("Lấy chi tiết danh mục và danh sách công thức đã xuất bản có phân trang");

        // FR-CAT-003: Tạo Danh mục Mới [Admin]
        group.MapPost("/", async (CreateCategoryDto dto, ISender sender) =>
        {
            var command = new CreateCategoryCommand(dto.Name, dto.Description, dto.ImageUrl, dto.OrderIndex);
            var result = await sender.Send(command);
            return Results.Created(
                $"/api/v1/categories/{result.Slug}",
                ApiResponse<CategoryDto>.Ok(result));
        })
        .WithName("CreateCategory")
        .WithSummary("Tạo danh mục mới (Admin)");

        // FR-CAT-005: Xóa Danh mục [Admin]
        group.MapDelete("/{id:guid}", async (Guid id, ISender sender) =>
        {
            await sender.Send(new DeleteCategoryCommand(id));
            return Results.NoContent();
        })
        .WithName("DeleteCategory")
        .WithSummary("Xóa danh mục (không được xóa nếu còn công thức)");

        return app;
    }
}
