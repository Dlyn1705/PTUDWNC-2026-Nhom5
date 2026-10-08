using CulinaryBlog.Domain.Entities;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.API.Endpoints;

public sealed record SetUserRoleRequest(string Role);

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/admin/users")
            .WithTags("Admin")
            .RequireAuthorization("AdminOnly");

        group.MapGet("/", async (UserManager<ApplicationUser> userManager) =>
        {
            var users = await userManager.Users
                .OrderBy(user => user.Email)
                .ToListAsync();
            var results = new List<object>(users.Count);
            foreach (var user in users)
            {
                results.Add(new
                {
                    user.Id,
                    user.Email,
                    user.DisplayName,
                    Roles = await userManager.GetRolesAsync(user)
                });
            }

            return Results.Ok(results);
        })
        .WithName("AdminListUsers")
        .WithSummary("Liệt kê tài khoản và vai trò (Admin)");

        group.MapPost("/{userId}/roles", async Task<IResult> (
            string userId,
            SetUserRoleRequest request,
            UserManager<ApplicationUser> userManager,
            RoleManager<IdentityRole> roleManager,
            HttpContext httpContext) =>
        {
            var role = request.Role?.Trim();
            if (role is not ("Admin" or "Author"))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["role"] = ["Role must be Admin or Author."]
                });
            }

            if (!await roleManager.RoleExistsAsync(role))
            {
                return Results.Problem("Requested role does not exist.", statusCode: StatusCodes.Status500InternalServerError);
            }

            var user = await userManager.FindByIdAsync(userId);
            if (user is null)
            {
                return Results.NotFound(new { message = "User not found." });
            }

            var currentRoles = await userManager.GetRolesAsync(user);
            if (currentRoles.Contains("Admin") && role != "Admin")
            {
                if (httpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value == user.Id)
                {
                    return Results.Conflict(new { message = "You cannot remove your own Admin role." });
                }

                var adminCount = await userManager.GetUsersInRoleAsync("Admin");
                if (adminCount.Count <= 1)
                {
                    return Results.Conflict(new { message = "The last Admin role cannot be removed." });
                }
            }

            if (!currentRoles.Contains(role))
            {
                var addResult = await userManager.AddToRoleAsync(user, role);
                if (!addResult.Succeeded)
                {
                    return Results.Problem(string.Join("; ", addResult.Errors.Select(error => error.Description)));
                }
            }

            var removeRoles = currentRoles.Where(existingRole => existingRole != role).ToArray();
            if (removeRoles.Length > 0)
            {
                var removeResult = await userManager.RemoveFromRolesAsync(user, removeRoles);
                if (!removeResult.Succeeded)
                {
                    return Results.Problem(string.Join("; ", removeResult.Errors.Select(error => error.Description)));
                }
            }

            return Results.Ok(new
            {
                user.Id,
                user.Email,
                user.DisplayName,
                Roles = await userManager.GetRolesAsync(user)
            });
        })
        .WithName("AdminSetUserRole")
        .WithSummary("Đặt vai trò tài khoản thành Admin hoặc Author (Admin)");

        return app;
    }
}
