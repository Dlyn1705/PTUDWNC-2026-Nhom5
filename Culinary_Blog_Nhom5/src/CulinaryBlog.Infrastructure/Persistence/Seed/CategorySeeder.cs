using CulinaryBlog.Domain.Entities;

namespace CulinaryBlog.Infrastructure.Persistence.Seed;

public static class CategorySeeder
{
    public static List<Category> Generate()
    {
        var names = new[]
        {
            "Mon khai vi",
            "Mon chinh",
            "Mon trang mieng",
            "Mon an sang",
            "Mon chay",
            "Mon Viet Nam",
            "Mon Han Quoc",
            "Mon Nhat Ban",
            "Mon Trung Quoc",
            "Mon Thai Lan",
            "Mon Italia",
            "Mon Phap",
            "Mon Mexico",
            "Mon An",
            "Mon My",
            "Mon bien",
            "Mon nuong",
            "Mon chien",
            "Mon hap",
            "Do uong"
        };

        return names.Select((name, index) => new Category
        {
            Id = Guid.NewGuid(),
            Name = name,
            Slug = CreateSlug(name),
            Description = $"Danh muc {name}",
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