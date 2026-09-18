using System.Collections.Generic;
using CulinaryBlog.Domain.Common;

namespace CulinaryBlog.Domain.Entities;

public class Category : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ImageUrl { get; set; }
    public int OrderIndex { get; set; } = 0;

    // Navigation
    public virtual ICollection<Recipe> Recipes { get; set; } = new List<Recipe>();

    public static Category Create(string name, string slug, string? description = null, string? imageUrl = null, int orderIndex = 0)
    {
        return new Category
        {
            Name = name,
            Slug = slug,
            Description = description,
            ImageUrl = imageUrl,
            OrderIndex = orderIndex
        };
    }

    public void Update(string name, string? description, string? imageUrl = null, int orderIndex = 0)
    {
        Name = name;
        Description = description;
        if (imageUrl != null) ImageUrl = imageUrl;
        OrderIndex = orderIndex;
        UpdatedAt = System.DateTime.UtcNow;
    }
}
