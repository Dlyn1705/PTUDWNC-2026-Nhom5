using CulinaryBlog.Domain.Entities;

namespace CulinaryBlog.Infrastructure.Persistence.Seed;

public static class CategorySeeder
{
    public static List<Category> Generate()
    {
        var names = new[]
        {
            "Appetizers",
            "Main Courses",
            "Desserts",
            "Breakfast",
            "Vegetarian",
            "Vietnamese Cuisine",
            "Korean Cuisine",
            "Japanese Cuisine",
            "Chinese Cuisine",
            "Thai Cuisine",
            "Italian Cuisine",
            "French Cuisine",
            "Mexican Cuisine",
            "Indian Cuisine",
            "American Cuisine",
            "Seafood",
            "Grilled Dishes",
            "Fried Dishes",
            "Steamed Dishes",
            "Beverages"
        };

        return names.Select((name, index) => new Category
        {
            Id = Guid.NewGuid(),
            Name = name,
            Slug = CreateSlug(name),
            Description = $"Recipes in the {name} category.",
            OrderIndex = index + 1
        }).ToList();
    }

    private static string CreateSlug(string value)
    {
        return value
            .ToLowerInvariant()
            .Replace(" ", "-");
    }
}
