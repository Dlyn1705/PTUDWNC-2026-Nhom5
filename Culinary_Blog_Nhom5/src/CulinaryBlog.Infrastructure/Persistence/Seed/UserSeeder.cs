using Bogus;
using CulinaryBlog.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace CulinaryBlog.Infrastructure.Persistence.Seed;

public static class UserSeeder
{
    public static async Task<List<ApplicationUser>> SeedAsync(
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole> roleManager)
    {
        var users = new List<ApplicationUser>();

        // =========================
        // Tạo Role
        // =========================
        string[] roles =
        {
            "Author",
            "Admin"
        };

        foreach (var role in roles)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                var result = await roleManager.CreateAsync(
                    new IdentityRole(role));

                if (!result.Succeeded)
                {
                    throw new Exception(
                        string.Join(
                            "; ",
                            result.Errors.Select(x => x.Description)));
                }
            }
        }

        var faker = new Faker("vi");

        // =========================
        // 5 Author
        // =========================
        for (int i = 1; i <= 5; i++)
        {
            string email = $"author{i}@culinaryblog.local";

            var user = await userManager.FindByEmailAsync(email);

            if (user == null)
            {
                user = new ApplicationUser
                {
                    UserName = email,
                    Email = email,
                    EmailConfirmed = true,
                    DisplayName = faker.Name.FullName(),
                    Bio = faker.Lorem.Sentence(),
                    IsActive = true
                };

                var result = await userManager.CreateAsync(
                    user,
                    "Author@123");

                if (!result.Succeeded)
                {
                    throw new Exception(
                        string.Join(
                            "; ",
                            result.Errors.Select(x => x.Description)));
                }

                await userManager.AddToRoleAsync(
                    user,
                    "Author");
            }

            users.Add(user);
        }

        // =========================
        // Admin
        // =========================
        const string adminEmail =
            "admin@culinaryblog.local";

        var admin = await userManager.FindByEmailAsync(
            adminEmail);

        if (admin == null)
        {
            admin = new ApplicationUser
            {
                UserName = adminEmail,
                Email = adminEmail,
                EmailConfirmed = true,
                DisplayName = "Culinary Blog Admin",
                Bio = "Quan tri vien he thong",
                IsActive = true
            };

            var result = await userManager.CreateAsync(
                admin,
                "Admin@123");

            if (!result.Succeeded)
            {
                throw new Exception(
                    string.Join(
                        "; ",
                        result.Errors.Select(x => x.Description)));
            }

            await userManager.AddToRoleAsync(
                admin,
                "Admin");
        }

        return users;
    }
}