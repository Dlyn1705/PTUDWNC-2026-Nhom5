using System;
using CulinaryBlog.Application.Common.Models;

namespace CulinaryBlog.Application.DTOs;

public class CategoryDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ImageUrl { get; set; }
    public int OrderIndex { get; set; }
    public int RecipeCount { get; set; }
}

public class CreateCategoryDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ImageUrl { get; set; }
    public int OrderIndex { get; set; } = 0;
}

public class UpdateCategoryDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ImageUrl { get; set; }
    public int OrderIndex { get; set; } = 0;
}

public sealed class CategoryDetailDto
{
    public CategoryDto Category { get; init; } = new();
    public PagedResult<RecipeSummaryDto> Recipes { get; init; } = new();
}

public sealed class RecipeSummaryDto
{
    public Guid Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Slug { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public string Description { get; init; } = string.Empty;
    public int PrepTimeMinutes { get; init; }
    public int CookTimeMinutes { get; init; }
    public int Servings { get; init; }
    public int Difficulty { get; init; }
    public int Status { get; init; }
    public Guid CategoryId { get; init; }
    public string CategoryName { get; init; } = string.Empty;
    public string CategorySlug { get; init; } = string.Empty;
    public RecipeAuthorSummaryDto Author { get; init; } = new();
    public IReadOnlyList<RecipeImageSummaryDto> Images { get; init; } = [];
}

public sealed class RecipeAuthorSummaryDto
{
    public string Id { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? AvatarUrl { get; init; }
}

public sealed class RecipeImageSummaryDto
{
    public Guid Id { get; init; }
    public string Url { get; init; } = string.Empty;
    public bool IsPrimary { get; init; }
    public string? Alt { get; init; }
}
