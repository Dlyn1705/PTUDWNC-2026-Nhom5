using System;
using System.Collections.Generic;
using System.Linq;
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
    public string? Instructions { get; set; }
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
    public virtual ICollection<RecipeSlugHistory> SlugHistory { get; set; } = new List<RecipeSlugHistory>();

    public static Recipe Create(
        string title,
        string slug,
        string description,
        string? instructions,
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
        string? instructions,
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

    public void ChangeDraftSlug(string slug)
    {
        EnsureActive();
        if (string.IsNullOrWhiteSpace(slug) || string.Equals(Slug, slug, StringComparison.Ordinal)) return;
        if (Status != RecipeStatus.Draft)
            throw new ConflictException("Slug của công thức đã xuất bản không được thay đổi.");
        Slug = slug.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void SoftDelete()
    {
        if (IsDeleted)
        {
            return;
        }

        IsDeleted = true;
        Status = RecipeStatus.Archived;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Publish()
    {
        EnsureActive();
        if (Status == RecipeStatus.Published) return;
        if (Status != RecipeStatus.Draft) throw new ConflictException("Hãy khôi phục công thức về bản nháp trước khi xuất bản.");
        var errors = new Dictionary<string, string[]>();
        if (!Steps.Any(step => !step.IsDeleted))
            errors["steps"] = ["Công thức phải có ít nhất một bước trước khi xuất bản."];
        if (!Ingredients.Any(ingredient => !ingredient.IsDeleted))
            errors["ingredients"] = ["Công thức phải có ít nhất một nguyên liệu trước khi xuất bản."];
        if (errors.Count > 0) throw new ValidationException(errors);

        Status = RecipeStatus.Published;
        PublishedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Unpublish()
    {
        EnsureActive();
        if (Status == RecipeStatus.Draft) return;
        if (Status != RecipeStatus.Published) throw new ConflictException("Không thể hủy xuất bản công thức đang lưu trữ.");
        Status = RecipeStatus.Draft;
        PublishedAt = null;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Archive()
    {
        EnsureActive();
        if (Status == RecipeStatus.Archived)
        {
            return;
        }

        Status = RecipeStatus.Archived;
        UpdatedAt = DateTime.UtcNow;
    }

    public void RestoreFromArchive()
    {
        EnsureActive();
        if (Status != RecipeStatus.Archived)
        {
            throw new ConflictException("Chỉ có thể khôi phục công thức đang ở trạng thái lưu trữ.");
        }

        Status = RecipeStatus.Draft;
        PublishedAt = null;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetNutrition(decimal? calories, decimal? protein, decimal? carbs, decimal? fat, decimal? fiber, decimal? sodium)
    {
        Nutrition = new RecipeNutrition(calories, protein, carbs, fat, fiber, sodium);
        UpdatedAt = DateTime.UtcNow;
    }

    private void EnsureActive()
    {
        if (IsDeleted) throw new NotFoundException("Recipe", Id);
    }
}
