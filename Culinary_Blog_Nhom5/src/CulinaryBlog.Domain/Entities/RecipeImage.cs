using System;
using CulinaryBlog.Domain.Common;

namespace CulinaryBlog.Domain.Entities;

public class RecipeImage : BaseEntity
{
    public Guid RecipeId { get; set; }
    public string OriginalUrl { get; set; } = string.Empty;
    public string? MediumUrl { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string? AltText { get; set; }
    public bool IsPrimary { get; set; } = false;
    public int OrderIndex { get; set; } = 0;

    public virtual Recipe Recipe { get; set; } = null!;

    public static RecipeImage Create(Guid recipeId, string originalUrl, string? altText = null, bool isPrimary = false, int orderIndex = 0)
    {
        return new RecipeImage
        {
            RecipeId = recipeId,
            OriginalUrl = originalUrl,
            AltText = altText,
            IsPrimary = isPrimary,
            OrderIndex = orderIndex
        };
    }
}
