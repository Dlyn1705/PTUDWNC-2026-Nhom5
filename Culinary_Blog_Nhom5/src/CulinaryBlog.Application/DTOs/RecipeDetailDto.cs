namespace CulinaryBlog.Application.DTOs;

public sealed class RecipeDetailDto
{
    public Guid Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Slug { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public string Description { get; init; } = string.Empty;
    public string Instructions { get; init; } = string.Empty;
    public int PrepTimeMinutes { get; init; }
    public int CookTimeMinutes { get; init; }
    public int Servings { get; init; }
    public int Difficulty { get; init; }
    public int Status { get; init; }
    public Guid CategoryId { get; init; }
    public string CategoryName { get; init; } = string.Empty;
    public string CategorySlug { get; init; } = string.Empty;
    public RecipeDetailAuthorDto Author { get; init; } = new();
    public RecipeDetailNutritionDto Nutrition { get; init; } = new();
    public IReadOnlyList<RecipeDetailImageDto> Images { get; init; } = [];
    public IReadOnlyList<RecipeDetailIngredientDto> Ingredients { get; init; } = [];
    public IReadOnlyList<RecipeDetailStepDto> Steps { get; init; } = [];
}

public sealed class RecipeDetailAuthorDto
{
    public string Id { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string? AvatarUrl { get; init; }
    public string? Bio { get; init; }
}

public sealed class RecipeDetailNutritionDto
{
    public decimal Calories { get; init; }
    public decimal Protein { get; init; }
    public decimal Carbs { get; init; }
    public decimal Fat { get; init; }
    public decimal Fiber { get; init; }
    public decimal Sodium { get; init; }
}

public sealed class RecipeDetailImageDto
{
    public Guid Id { get; init; }
    public string Url { get; init; } = string.Empty;
    public bool IsPrimary { get; init; }
    public string? Alt { get; init; }
}

public sealed class RecipeDetailIngredientDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public decimal Quantity { get; init; }
    public string Unit { get; init; } = string.Empty;
    public string? Notes { get; init; }
}

public sealed class RecipeDetailStepDto
{
    public Guid Id { get; init; }
    public int Order { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Text { get; init; } = string.Empty;
    public string? ImageUrl { get; init; }
    public int? TimerMinutes { get; init; }
}
