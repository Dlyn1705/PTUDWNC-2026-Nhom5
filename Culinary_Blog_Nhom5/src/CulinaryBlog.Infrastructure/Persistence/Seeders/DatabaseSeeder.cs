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
        "Món khai vị", "Món chính", "Món chay", "Món nước", "Món xào",
        "Món chiên", "Món nướng", "Món hấp", "Món kho", "Cơm",
        "Bún và phở", "Mì", "Hải sản", "Thịt gà", "Thịt bò",
        "Thịt heo", "Salad", "Bánh ngọt", "Tráng miệng", "Đồ uống",
        "Món ăn sáng", "Món ăn nhanh"
    ];

    private static readonly string[] MainIngredients =
    [
        "thịt gà", "thịt bò", "thịt heo", "cá hồi", "cá thu", "cá basa",
        "tôm", "mực", "nghêu", "đậu hũ", "nấm", "trứng", "khoai tây",
        "cà tím", "bông cải", "bí đỏ", "rau củ", "sườn non", "vịt", "cua"
    ];

    private static readonly string[] CookingMethods =
    [
        "chiên giòn", "xào", "hấp", "nướng", "kho", "rim", "luộc",
        "áp chảo", "sốt tiêu", "sốt chua ngọt", "om", "rang muối"
    ];

    private static readonly string[] AllIngredients =
    [
        "Muối", "Đường", "Tiêu đen", "Nước mắm", "Dầu ăn", "Hành tím",
        "Tỏi", "Gừng", "Ớt", "Hành lá", "Rau mùi", "Nước tương",
        "Dầu hào", "Bột ngọt", "Chanh", "Mật ong", "Bột năng", "Bột mì",
        "Sữa tươi", "Nước dùng", "Sả", "Lá chanh", "Hành tây", "Cà chua",
        "Cà rốt", "Khoai tây", "Nấm hương", "Ớt chuông", "Rau thơm",
        "Dầu mè", "Giấm gạo", "Hạt nêm", "Nước cốt dừa", "Đậu phộng",
        "Mè rang", "Bơ lạt", "Phô mai", "Trứng gà", "Bắp cải", "Dưa leo"
    ];

    private static readonly string[] IngredientUnits =
    [
        "g", "kg", "ml", "l", "muỗng canh", "muỗng cà phê",
        "quả", "củ", "nhánh", "phần"
    ];

    private static readonly string[] IngredientNotes =
    [
        "rửa sạch", "thái nhỏ", "băm nhuyễn", "để ráo", "thái lát",
        "cắt khúc", "rang thơm", "đập dập"
    ];

    private static readonly string[] StepTitles =
    [
        "Chuẩn bị nguyên liệu", "Sơ chế nguyên liệu", "Ướp nguyên liệu chính",
        "Chuẩn bị dụng cụ", "Làm nóng chảo", "Chế biến nguyên liệu",
        "Nêm nếm gia vị", "Hoàn thiện và trình bày"
    ];

    private static readonly string[] StepDescriptions =
    [
        "Chuẩn bị đầy đủ nguyên liệu theo định lượng, kiểm tra độ tươi và sắp xếp riêng từng nhóm.",
        "Rửa sạch nguyên liệu, để ráo rồi cắt thái phù hợp để món ăn chín đều.",
        "Trộn nguyên liệu chính với gia vị và để thấm trước khi bắt đầu chế biến.",
        "Chuẩn bị nồi, chảo và các dụng cụ cần thiết; giữ khu vực nấu sạch sẽ, khô ráo.",
        "Làm nóng dụng cụ nấu ở mức lửa vừa, thêm dầu hoặc nước dùng theo công thức.",
        "Cho nguyên liệu vào chế biến, đảo nhẹ và giữ nhiệt độ ổn định để không bị cháy.",
        "Nêm nếm lại cho vừa ăn, điều chỉnh độ mặn ngọt và tiếp tục nấu đến khi chín.",
        "Tắt bếp, trình bày món ăn ra đĩa và dùng khi còn nóng để có hương vị tốt nhất."
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
                $"Tổng hợp các công thức thuộc danh mục {name.ToLowerInvariant()}.",
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
            var faker = new Faker("vi")
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
                    $"Công thức {title} thơm ngon, dễ thực hiện và phù hợp cho bữa ăn gia đình.",
                    "Chuẩn bị nguyên liệu và thực hiện lần lượt theo các bước hướng dẫn bên dưới.",
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
