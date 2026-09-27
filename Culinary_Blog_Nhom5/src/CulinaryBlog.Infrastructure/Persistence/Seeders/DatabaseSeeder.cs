using Bogus;
using CulinaryBlog.Application.Common.Helpers;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Persistence.Seeders;

public sealed class DatabaseSeeder
{
    private const int RecipeCount = 110;
    private const string SeedAuthorEmail = "seed.author@culinary.local";
    private const string SeedAuthorPassword = "Seed@Author2026";

    private static readonly string[] CategoryNames =
    [
        "Appetizers", "Main Courses", "Vegetarian", "Soups", "Stir-Fries",
        "Fried Dishes", "Grilled Dishes", "Steamed Dishes", "Braised Dishes", "Rice Dishes",
        "Noodles and Pho", "Noodles", "Seafood", "Chicken", "Beef",
        "Pork", "Salads", "Cakes", "Desserts", "Beverages",
        "Breakfast", "Fast Food"
    ];

    private static readonly string[] MainIngredients =
    [
        "chicken", "beef", "pork", "salmon", "mackerel", "basa fish",
        "shrimp", "squid", "clams", "tofu", "mushrooms", "eggs", "potatoes",
        "eggplant", "broccoli", "pumpkin", "vegetables", "pork ribs", "duck", "crab"
    ];

    private static readonly string[] CookingMethods =
    [
        "Crispy Fried", "Stir-Fried", "Steamed", "Grilled", "Braised", "Caramelized",
        "Boiled", "Pan-Seared", "with Pepper Sauce", "with Sweet and Sour Sauce",
        "Slow-Cooked", "Salt-Roasted"
    ];

    private static readonly string[] AllIngredients =
    [
        "Salt", "Sugar", "Black Pepper", "Fish Sauce", "Cooking Oil", "Shallots",
        "Garlic", "Ginger", "Chili", "Green Onions", "Cilantro", "Soy Sauce",
        "Oyster Sauce", "MSG", "Lime", "Honey", "Tapioca Starch", "Flour",
        "Fresh Milk", "Stock", "Lemongrass", "Lime Leaves", "Onion", "Tomatoes",
        "Carrots", "Potatoes", "Shiitake Mushrooms", "Bell Peppers", "Fresh Herbs",
        "Sesame Oil", "Rice Vinegar", "Seasoning Powder", "Coconut Milk", "Peanuts",
        "Toasted Sesame", "Unsalted Butter", "Cheese", "Eggs", "Cabbage", "Cucumber"
    ];

    private static readonly string[] IngredientUnits =
    [
        "g", "kg", "ml", "l", "tablespoons", "teaspoons",
        "pieces", "bulbs", "sprigs", "servings"
    ];

    private static readonly string[] IngredientNotes =
    [
        "washed", "finely chopped", "minced", "drained", "sliced",
        "cut into pieces", "toasted", "crushed"
    ];

    private static readonly string[] StepTitles =
    [
        "Gather the Ingredients", "Prepare the Ingredients", "Marinate the Main Ingredient",
        "Prepare the Cookware", "Preheat the Pan", "Cook the Ingredients",
        "Adjust the Seasoning", "Finish and Serve"
    ];

    private static readonly string[] StepDescriptions =
    [
        "Measure all ingredients, check their freshness, and arrange them by group.",
        "Wash and drain the ingredients, then cut them evenly so they cook at the same rate.",
        "Mix the main ingredient with the seasonings and let it marinate before cooking.",
        "Prepare the pots, pans, and utensils, and keep the cooking area clean and dry.",
        "Preheat the cookware over medium heat and add oil or stock as directed.",
        "Add the ingredients, stir gently, and maintain a steady temperature to prevent burning.",
        "Taste and adjust the seasoning, then continue cooking until everything is done.",
        "Turn off the heat, plate the dish, and serve it hot for the best flavor."
    ];

    private readonly ApplicationDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<IdentityRole> _roleManager;
    private readonly ILogger<DatabaseSeeder> _logger;

    public DatabaseSeeder(
        ApplicationDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole> roleManager,
        ILogger<DatabaseSeeder> logger)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _roleManager = roleManager;
        _logger = logger;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        Randomizer.Seed = new Random(2026);

        await SeedRolesAsync();
        var author = await SeedAuthorAsync();
        var categories = await SeedCategoriesAsync(cancellationToken);
        await SeedRecipesAsync(author, categories, cancellationToken);

        _logger.LogInformation(
            "Database seed completed with at least {CategoryCount} categories and {RecipeCount} recipes.",
            CategoryNames.Length,
            RecipeCount);
    }

    private async Task SeedRolesAsync()
    {
        foreach (var roleName in new[] { "Admin", "Author" })
        {
            if (await _roleManager.RoleExistsAsync(roleName))
            {
                continue;
            }

            var result = await _roleManager.CreateAsync(new IdentityRole(roleName));
            EnsureIdentitySucceeded(result, $"Không thể tạo role {roleName}");
        }
    }

    private async Task<ApplicationUser> SeedAuthorAsync()
    {
        var user = await _userManager.FindByEmailAsync(SeedAuthorEmail);

        if (user is null)
        {
            user = ApplicationUser.Create(
                SeedAuthorEmail,
                "seed.author",
                "Culinary Seed Author");

            var createResult = await _userManager.CreateAsync(user, SeedAuthorPassword);
            EnsureIdentitySucceeded(createResult, "Không thể tạo tài khoản seed author");
        }

        if (!await _userManager.IsInRoleAsync(user, "Author"))
        {
            var roleResult = await _userManager.AddToRoleAsync(user, "Author");
            EnsureIdentitySucceeded(roleResult, "Không thể gán role Author cho seed author");
        }

        return user;
    }

    private async Task<List<Category>> SeedCategoriesAsync(CancellationToken cancellationToken)
    {
        var existingSlugs = await _dbContext.Categories
            .IgnoreQueryFilters()
            .Select(category => category.Slug)
            .ToHashSetAsync(cancellationToken);

        for (var index = 0; index < CategoryNames.Length; index++)
        {
            var name = CategoryNames[index];
            var slug = $"seed-{SlugHelper.Generate(name)}";

            if (existingSlugs.Contains(slug))
            {
                continue;
            }

            _dbContext.Categories.Add(Category.Create(
                name,
                slug,
                $"A collection of recipes in the {name.ToLowerInvariant()} category.",
                orderIndex: index + 1));
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return await _dbContext.Categories
            .Where(category => category.Slug.StartsWith("seed-"))
            .OrderBy(category => category.OrderIndex)
            .ToListAsync(cancellationToken);
    }

    private async Task SeedRecipesAsync(
        ApplicationUser author,
        IReadOnlyList<Category> categories,
        CancellationToken cancellationToken)
    {
        if (categories.Count < 20)
        {
            throw new InvalidOperationException("Seeder cần ít nhất 20 category để tạo recipe.");
        }

        var existingRecipes = await _dbContext.Recipes
            .Include(recipe => recipe.Ingredients)
            .Include(recipe => recipe.Steps)
            .AsSplitQuery()
            .Where(recipe => recipe.Slug.StartsWith("seed-recipe-"))
            .ToDictionaryAsync(recipe => recipe.Slug, cancellationToken);

        for (var recipeIndex = 1; recipeIndex <= RecipeCount; recipeIndex++)
        {
            // A seed per recipe keeps generated targets stable even when a recipe already exists.
            var faker = new Faker("en")
            {
                Random = new Randomizer(2026 + recipeIndex)
            };
            var mainIngredient = faker.PickRandom(MainIngredients);
            var cookingMethod = faker.PickRandom(CookingMethods);
            var category = categories[(recipeIndex - 1) % categories.Count];
            var title = $"{ToTitleCase(mainIngredient)} {cookingMethod} {recipeIndex:000}";
            var slug = $"seed-recipe-{recipeIndex:000}";
            var ingredientCount = faker.Random.Int(10, 15);
            var stepCount = faker.Random.Int(5, 8);

            if (!existingRecipes.TryGetValue(slug, out var recipe))
            {
                recipe = Recipe.Create(
                    title,
                    slug,
                    $"A delicious and approachable {title} recipe, perfect for a family meal.",
                    "Prepare the ingredients and follow the cooking steps below in order.",
                    faker.Random.Int(5, 45),
                    faker.Random.Int(10, 120),
                    faker.Random.Int(1, 8),
                    faker.PickRandom<RecipeDifficulty>(),
                    category.Id,
                    author.Id);

                recipe.SetNutrition(
                    faker.Random.Decimal(100, 900),
                    faker.Random.Decimal(5, 80),
                    faker.Random.Decimal(5, 120),
                    faker.Random.Decimal(1, 60),
                    faker.Random.Decimal(1, 30),
                    faker.Random.Decimal(50, 1500));

                _dbContext.Recipes.Add(recipe);
            }

            AddMissingIngredients(recipe, ingredientCount, faker);
            AddMissingSteps(recipe, stepCount, faker);

            if (recipe.Status == RecipeStatus.Draft)
            {
                recipe.Publish();
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private static void AddMissingIngredients(Recipe recipe, int targetCount, Faker faker)
    {
        var existingNames = recipe.Ingredients
            .Select(ingredient => ingredient.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var candidates = faker.Random.Shuffle(AllIngredients)
            .Where(name => !existingNames.Contains(name))
            .ToList();

        var nextOrderIndex = recipe.Ingredients.Count + 1;

        foreach (var name in candidates)
        {
            if (recipe.Ingredients.Count >= targetCount)
            {
                break;
            }

            recipe.Ingredients.Add(RecipeIngredient.Create(
                recipe.Id,
                name,
                faker.Random.Decimal(0.5m, 500m),
                faker.PickRandom(IngredientUnits),
                faker.Random.Bool() ? faker.PickRandom(IngredientNotes) : null,
                nextOrderIndex++));
        }

        if (recipe.Ingredients.Count < 10)
        {
            throw new InvalidOperationException($"Recipe {recipe.Slug} không đủ 10 nguyên liệu.");
        }
    }

    private static void AddMissingSteps(Recipe recipe, int targetCount, Faker faker)
    {
        var nextStepNumber = recipe.Steps.Count == 0
            ? 1
            : recipe.Steps.Max(step => step.StepNumber) + 1;

        while (recipe.Steps.Count < targetCount)
        {
            var templateIndex = (nextStepNumber - 1) % StepTitles.Length;
            recipe.Steps.Add(RecipeStep.Create(
                recipe.Id,
                nextStepNumber,
                StepTitles[templateIndex],
                StepDescriptions[templateIndex],
                faker.Random.Int(3, 30)));

            nextStepNumber++;
        }

        if (recipe.Steps.Count < 5)
        {
            throw new InvalidOperationException($"Recipe {recipe.Slug} không đủ 5 bước chế biến.");
        }
    }

    private static string ToTitleCase(string value)
    {
        return string.Join(
            ' ',
            value.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Select(word => char.ToUpperInvariant(word[0]) + word[1..]));
    }

    private static void EnsureIdentitySucceeded(IdentityResult result, string message)
    {
        if (result.Succeeded)
        {
            return;
        }

        var errors = string.Join("; ", result.Errors.Select(error => error.Description));
        throw new InvalidOperationException($"{message}: {errors}");
    }
}
