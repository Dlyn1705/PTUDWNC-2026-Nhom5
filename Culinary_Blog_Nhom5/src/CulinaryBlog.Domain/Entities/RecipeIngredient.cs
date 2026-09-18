using System;
using CulinaryBlog.Domain.Common;

namespace CulinaryBlog.Domain.Entities;

public class RecipeIngredient : BaseEntity
{
    public Guid RecipeId { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal? Quantity { get; set; }
    public string? Unit { get; set; }
    public string? Notes { get; set; }
    public int OrderIndex { get; set; } = 0;

    public virtual Recipe Recipe { get; set; } = null!;

    public static RecipeIngredient Create(Guid recipeId, string name, decimal? quantity, string? unit, string? notes = null, int orderIndex = 0)
    {
        return new RecipeIngredient
        {
            RecipeId = recipeId,
            Name = name,
            Quantity = quantity,
            Unit = unit,
            Notes = notes,
            OrderIndex = orderIndex
        };
    }
}
