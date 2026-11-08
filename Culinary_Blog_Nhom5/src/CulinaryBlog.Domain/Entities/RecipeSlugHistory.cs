using System;

namespace CulinaryBlog.Domain.Entities;

/// <summary>
/// Publicly safe history of a recipe slug. Old slugs only redirect once the
/// recipe is Published; Draft/Archived/Deleted content remains private.
/// </summary>
public sealed class RecipeSlugHistory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RecipeId { get; set; }
    public string OldSlug { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Recipe Recipe { get; set; } = null!;
}
