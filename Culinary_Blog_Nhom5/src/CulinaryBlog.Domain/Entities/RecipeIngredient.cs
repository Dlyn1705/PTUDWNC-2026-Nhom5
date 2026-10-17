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
            Name = name.Trim(),
            Quantity = quantity,
            Unit = Normalize(unit),
            Notes = Normalize(notes),
            OrderIndex = orderIndex
        };
    }

    public void Update(string name, decimal? quantity, string? unit, string? notes)
    {
        Name = name.Trim();
        Quantity = quantity;
        Unit = Normalize(unit);
        Notes = Normalize(notes);
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
