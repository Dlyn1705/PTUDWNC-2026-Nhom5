using System;
using System.Collections.Generic;
using CulinaryBlog.Domain.Common;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using NpgsqlTypes;

namespace CulinaryBlog.Domain.Entities;

public class Recipe : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Instructions { get; set; } = string.Empty;
    public int PrepTime { get; set; }
    public int CookTime { get; set; }
    public int Servings { get; set; }
    public RecipeDifficulty Difficulty { get; set; } = RecipeDifficulty.Easy;
    public RecipeStatus Status { get; set; } = RecipeStatus.Draft;
    public DateTime? PublishedAt { get; set; }

    /// <summary>
    /// Vector tìm kiếm toàn văn bản PostgreSQL tsvector (FR-SRCH-001)
    /// Tự động cập nhật bởi trigger trg_recipes_search_vector_update
    /// </summary>
    public NpgsqlTsVector? SearchVector { get; set; }

    // Foreign Keys
    public Guid CategoryId { get; set; }
    public string AuthorId { get; set; } = string.Empty;

    // Owned Entity
    public RecipeNutrition Nutrition { get; set; } = new RecipeNutrition();

    // Navigations
    public virtual Category Category { get; set; } = null!;
    public virtual ApplicationUser Author { get; set; } = null!;
    public virtual ICollection<RecipeStep> Steps { get; set; } = new List<RecipeStep>();
    public virtual ICollection<RecipeIngredient> Ingredients { get; set; } = new List<RecipeIngredient>();
    public virtual ICollection<RecipeImage> Images { get; set; } = new List<RecipeImage>();

    public static Recipe Create(
        string title,
        string slug,
        string description,
        string instructions,
        int prepTime,
        int cookTime,
        int servings,
        RecipeDifficulty difficulty,
        Guid categoryId,
        string authorId)
    {
        return new Recipe
        {
            Title = title,
            Slug = slug,
            Description = description,
            Instructions = instructions,
            PrepTime = prepTime,
            CookTime = cookTime,
            Servings = servings,
            Difficulty = difficulty,
            Status = RecipeStatus.Draft,
            CategoryId = categoryId,
            AuthorId = authorId
        };
    }

    public void Update(
        string title,
        string description,
        string instructions,
        int prepTime,
        int cookTime,
        int servings,
        RecipeDifficulty difficulty,
        Guid categoryId)
    {
        Title = title;
        Description = description;
        Instructions = instructions;
        PrepTime = prepTime;
        CookTime = cookTime;
        Servings = servings;
        Difficulty = difficulty;
        CategoryId = categoryId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Publish()
    {
        if (Steps.Count == 0)
        {
            throw new DomainException("Công thức phải có ít nhất 1 bước thực hiện trước khi xuất bản.");
        }

        Status = RecipeStatus.Published;
        PublishedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Unpublish()
    {
        Status = RecipeStatus.Draft;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Archive()
    {
        Status = RecipeStatus.Archived;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetNutrition(decimal? calories, decimal? protein, decimal? carbs, decimal? fat, decimal? fiber, decimal? sodium)
    {
        Nutrition = new RecipeNutrition(calories, protein, carbs, fat, fiber, sodium);
        UpdatedAt = DateTime.UtcNow;
    }
}
