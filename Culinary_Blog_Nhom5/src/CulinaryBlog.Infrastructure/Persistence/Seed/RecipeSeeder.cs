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
        var faker = new Faker("en");

        for (int i = 1; i <= 100; i++)
        {
            var category = faker.PickRandom(categories);
            var author = faker.PickRandom(users);

            var title = $"Recipe {i}";

            var recipe = new Recipe
            {
                Id = Guid.NewGuid(),

                Title = title,

                Slug = $"recipe-{i}",

                Description =
                    $"A delicious, easy-to-follow guide for preparing {title}.",

                Instructions =
                    "Prepare the ingredients, follow each cooking step, and plate the finished dish.",

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
            ("Chicken", 500m, "g"),
            ("Beef", 300m, "g"),
            ("Fish", 400m, "g"),
            ("Shrimp", 300m, "g"),
            ("Eggs", 3m, "pieces"),
            ("Carrots", 2m, "pieces"),
            ("Potatoes", 3m, "pieces"),
            ("Onion", 1m, "piece"),
            ("Garlic", 3m, "cloves"),
            ("Fish sauce", 2m, "tablespoons"),
            ("Sugar", 1m, "tablespoon"),
            ("Salt", 1m, "teaspoon"),
            ("Black pepper", 1m, "teaspoon"),
            ("Cooking oil", 2m, "tablespoons"),
            ("Chili", 1m, "piece")
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

                Title = "Prepare the ingredients",

                Description =
                    "Clean and prepare all ingredients.",

                TimerMinutes = 5
            });

            result.Add(new RecipeStep
            {
                Id = Guid.NewGuid(),

                RecipeId = recipe.Id,

                StepNumber = 2,

                Title = "Cut and season",

                Description =
                    "Cut and season the required ingredients.",

                TimerMinutes = 10
            });

            result.Add(new RecipeStep
            {
                Id = Guid.NewGuid(),

                RecipeId = recipe.Id,

                StepNumber = 3,

                Title = "Cook the dish",

                Description =
                    "Add the ingredients to the cookware and begin cooking.",

                TimerMinutes = 15
            });

            result.Add(new RecipeStep
            {
                Id = Guid.NewGuid(),

                RecipeId = recipe.Id,

                StepNumber = 4,

                Title = "Adjust the seasoning",

                Description =
                    "Add seasonings and adjust the flavor to taste.",

                TimerMinutes = 5
            });

            result.Add(new RecipeStep
            {
                Id = Guid.NewGuid(),

                RecipeId = recipe.Id,

                StepNumber = 5,

                Title = "Finish and serve",

                Description =
                    "Check the dish, turn off the heat, and plate it for serving.",

                TimerMinutes = 5
            });
        }

        return result;
    }
}
