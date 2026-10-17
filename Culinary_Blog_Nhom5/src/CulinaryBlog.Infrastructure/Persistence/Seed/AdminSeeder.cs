using CulinaryBlog.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;

namespace CulinaryBlog.Infrastructure.Persistence.Seed;

public static class AdminSeeder
{
    public static async Task<ApplicationUser> SeedAsync(
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole> roleManager,
        IConfiguration configuration)
    {
        const string adminRole = "Admin";
        if (!await roleManager.RoleExistsAsync(adminRole))
        {
            var createRoleResult = await roleManager.CreateAsync(new IdentityRole(adminRole));
            EnsureSucceeded(createRoleResult);
        }

        var email = configuration["AdminSeed:Email"];
        var password = configuration["AdminSeed:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException(
                "AdminSeed:Email and AdminSeed:Password must be configured when admin seeding is enabled.");
        }

        var admin = await userManager.FindByEmailAsync(email);
        if (admin is null)
        {
            admin = new ApplicationUser
            {
                UserName = email,
                Email = email,
                EmailConfirmed = true,
                DisplayName = "Culinary Blog Admin",
                Bio = "Quan tri vien he thong",
                IsActive = true
            };

            var createUserResult = await userManager.CreateAsync(admin, password);
            EnsureSucceeded(createUserResult);
        }
        else if (configuration.GetValue<bool>("AdminSeed:ResetExistingPassword")
            && !await userManager.CheckPasswordAsync(admin, password))
        {
            var resetToken = await userManager.GeneratePasswordResetTokenAsync(admin);
            var resetResult = await userManager.ResetPasswordAsync(admin, resetToken, password);
            EnsureSucceeded(resetResult);
        }

        if (!await userManager.IsInRoleAsync(admin, adminRole))
        {
            var addRoleResult = await userManager.AddToRoleAsync(admin, adminRole);
            EnsureSucceeded(addRoleResult);
        }

        return admin;
    }

    private static void EnsureSucceeded(IdentityResult result)
    {
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(string.Join("; ", result.Errors.Select(error => error.Description)));
        }
    }
}
