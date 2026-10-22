using CulinaryBlog.Domain.Entities;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CulinaryBlog.API.Endpoints;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/admin/users")
            .WithTags("Admin")
            .RequireAuthorization("AdminPolicy");

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

        // The Admin role is deliberately not managed through an HTTP endpoint.
        // It is granted only by the startup/database seeders, as required by the
        // account and authorization rules.

        return app;
    }
}
