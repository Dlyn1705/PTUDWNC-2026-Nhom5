using System;

namespace CulinaryBlog.Application.DTOs;

public sealed class SearchRecipeSummaryDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string? PrimaryImageUrl { get; set; }
    public SearchRecipeCategorySummaryDto Category { get; set; } = new();
    public SearchRecipeAuthorSummaryDto Author { get; set; } = new();
    public string Difficulty { get; set; } = string.Empty;
    public int PrepTime { get; set; }
    public int CookTime { get; set; }
    public int Servings { get; set; }
    public double RelevanceScore { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class SearchRecipeCategorySummaryDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
}

public sealed class SearchRecipeAuthorSummaryDto
{
    public string Id { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
}
