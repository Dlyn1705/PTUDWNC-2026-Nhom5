using System;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Categories.Commands.CreateCategory;
using CulinaryBlog.Application.Features.Categories.Commands.DeleteCategory;
using CulinaryBlog.Application.Features.Categories.Queries.GetCategories;
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
            return Results.Ok(result);
        })
        .WithName("GetCategories")
        .WithSummary("Lấy danh sách tất cả danh mục kèm số lượng công thức");

        // FR-CAT-003: Tạo Danh mục Mới [Admin]
        group.MapPost("/", async (CreateCategoryDto dto, ISender sender) =>
        {
            var command = new CreateCategoryCommand(dto.Name, dto.Description, dto.ImageUrl, dto.OrderIndex);
            var result = await sender.Send(command);
            return Results.Created($"/api/v1/categories/{result.Slug}", result);
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
