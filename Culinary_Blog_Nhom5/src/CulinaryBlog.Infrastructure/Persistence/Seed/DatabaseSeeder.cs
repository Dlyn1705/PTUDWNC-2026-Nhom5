using CulinaryBlog.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.Infrastructure.Persistence.Seed;

public static class DatabaseSeeder
{
    public static async Task SeedAsync(
        ApplicationDbContext context,
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole> roleManager)
    {
        // 1. Migration
        await context.Database.MigrateAsync();

        // 2. Users + Roles
        var users = await UserSeeder.SeedAsync(
            userManager,
            roleManager);

        // 3. Categories
        List<Category> categories;

        if (!await context.Categories.AnyAsync())
        {
            categories = CategorySeeder.Generate();

            await context.Categories.AddRangeAsync(categories);

            await context.SaveChangesAsync();
        }
        else
        {
            categories = await context.Categories
                .OrderBy(x => x.OrderIndex)
                .ToListAsync();
        }

        // 4. Recipes
        if (!await context.Recipes.AnyAsync())
        {
            var recipes = new List<Recipe>();

            RecipeSeeder.Generate(
                recipes,
                categories,
                users);

            await context.Recipes.AddRangeAsync(recipes);

            await context.SaveChangesAsync();

            // 5. Ingredients
            var ingredients =
                RecipeSeeder.GenerateIngredients(recipes);

            await context.RecipeIngredients
                .AddRangeAsync(ingredients);

            // 6. Steps
            var steps =
                RecipeSeeder.GenerateSteps(recipes);

            await context.RecipeSteps
                .AddRangeAsync(steps);

            await context.SaveChangesAsync();
        }
    }
}