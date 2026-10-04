using System.Security.Claims;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;

namespace CulinaryBlog.Application.Common.Authorization;

public sealed class RecipeAuthorizationHandler
    : AuthorizationHandler<OperationAuthorizationRequirement, Recipe>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        OperationAuthorizationRequirement requirement,
        Recipe recipe)
    {
        if (context.User.IsInRole("Admin"))
        {
            context.Succeed(requirement);
            return Task.CompletedTask;
        }

        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isOwner = !string.IsNullOrWhiteSpace(userId)
            && string.Equals(userId, recipe.AuthorId, StringComparison.Ordinal);

        if (requirement.Name == RecipeOperations.Read.Name
            && (recipe.Status == RecipeStatus.Published || isOwner))
        {
            context.Succeed(requirement);
        }
        else if (context.User.IsInRole("Author")
            && isOwner
            && (requirement.Name == RecipeOperations.Update.Name
                || requirement.Name == RecipeOperations.Delete.Name))
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}

public static class RecipeOperations
{
    public static readonly OperationAuthorizationRequirement Create = new() { Name = "Create" };
    public static readonly OperationAuthorizationRequirement Read = new() { Name = "Read" };
    public static readonly OperationAuthorizationRequirement Update = new() { Name = "Update" };
    public static readonly OperationAuthorizationRequirement Delete = new() { Name = "Delete" };
}