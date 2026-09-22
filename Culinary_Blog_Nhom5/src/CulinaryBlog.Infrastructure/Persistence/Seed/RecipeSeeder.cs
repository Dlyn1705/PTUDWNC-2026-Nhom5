using Bogus;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;

namespace CulinaryBlog.Infrastructure.Persistence.Seed;

public static class RecipeSeeder
{
    // ============================================================
    // TẠO 100 RECIPES
    // ============================================================
    public static void Generate(
        List<Recipe> recipes,
        List<Category> categories,
        List<ApplicationUser> users)
    {
        var faker = new Faker("vi");

        for (int i = 1; i <= 100; i++)
        {
            var category = faker.PickRandom(categories);
            var author = faker.PickRandom(users);

            var title = $"Cong thuc mon an {i}";

            var recipe = new Recipe
            {
                Id = Guid.NewGuid(),

                Title = title,

                Slug = $"cong-thuc-mon-an-{i}",

                Description =
                    $"Huong dan nau {title} ngon, don gian va de thuc hien.",

                Instructions =
                    "Chuan bi nguyen lieu, so che, tien hanh nau va trinh bay mon an.",

                PrepTime =
                    faker.Random.Int(5, 60),

                CookTime =
                    faker.Random.Int(10, 120),

                Servings =
                    faker.Random.Int(1, 8),

                Difficulty =
                    faker.PickRandom<RecipeDifficulty>(),

                Status =
                    RecipeStatus.Published,

                CategoryId =
                    category.Id,

                AuthorId =
                    author.Id,

                PublishedAt =
                    DateTime.UtcNow
            };

            recipes.Add(recipe);
        }
    }


    // ============================================================
    // TẠO ÍT NHẤT 10 NGUYÊN LIỆU CHO MỖI RECIPE
    // 100 Recipes × 10 = 1000 Ingredients
    // ============================================================
    public static List<RecipeIngredient> GenerateIngredients(
        List<Recipe> recipes)
    {
        var result = new List<RecipeIngredient>();

        var ingredients = new[]
        {
            ("Thit ga", 500m, "g"),
            ("Thit bo", 300m, "g"),
            ("Ca", 400m, "g"),
            ("Tom", 300m, "g"),
            ("Trung ga", 3m, "qua"),
            ("Ca rot", 2m, "cu"),
            ("Khoai tay", 3m, "cu"),
            ("Hanh tay", 1m, "cu"),
            ("Toi", 3m, "tep"),
            ("Nuoc mam", 2m, "muong canh"),
            ("Duong", 1m, "muong canh"),
            ("Muoi", 1m, "muong ca phe"),
            ("Tieu", 1m, "muong ca phe"),
            ("Dau an", 2m, "muong canh"),
            ("Ot", 1m, "qua")
        };

        foreach (var recipe in recipes)
        {
            // Mỗi recipe lấy 10 nguyên liệu đầu tiên.
            for (int i = 0; i < 10; i++)
            {
                var item = ingredients[i];

                var ingredient = RecipeIngredient.Create(
                    recipe.Id,
                    item.Item1,
                    item.Item2,
                    item.Item3,
                    null,
                    i + 1);

                result.Add(ingredient);
            }
        }

        return result;
    }


    // ============================================================
    // TẠO ÍT NHẤT 5 BƯỚC CHO MỖI RECIPE
    // 100 Recipes × 5 = 500 Steps
    // ============================================================
    public static List<RecipeStep> GenerateSteps(
        List<Recipe> recipes)
    {
        var result = new List<RecipeStep>();

        foreach (var recipe in recipes)
        {
            result.Add(new RecipeStep
            {
                Id = Guid.NewGuid(),

                RecipeId = recipe.Id,

                StepNumber = 1,

                Title = "So che nguyen lieu",

                Description =
                    "Lam sach va so che cac nguyen lieu.",

                TimerMinutes = 5
            });

            result.Add(new RecipeStep
            {
                Id = Guid.NewGuid(),

                RecipeId = recipe.Id,

                StepNumber = 2,

                Title = "Chuan bi",

                Description =
                    "Cat, uop va chuan bi cac nguyen lieu can thiet.",

                TimerMinutes = 10
            });

            result.Add(new RecipeStep
            {
                Id = Guid.NewGuid(),

                RecipeId = recipe.Id,

                StepNumber = 3,

                Title = "Tien hanh nau",

                Description =
                    "Cho nguyen lieu vao dung cu nau va tien hanh nau.",

                TimerMinutes = 15
            });

            result.Add(new RecipeStep
            {
                Id = Guid.NewGuid(),

                RecipeId = recipe.Id,

                StepNumber = 4,

                Title = "Niem gia vi",

                Description =
                    "Them gia vi va dieu chinh huong vi cho phu hop.",

                TimerMinutes = 5
            });

            result.Add(new RecipeStep
            {
                Id = Guid.NewGuid(),

                RecipeId = recipe.Id,

                StepNumber = 5,

                Title = "Hoan thanh",

                Description =
                    "Kiem tra mon an, tat bep va trinh bay ra dia.",

                TimerMinutes = 5
            });
        }

        return result;
    }
}