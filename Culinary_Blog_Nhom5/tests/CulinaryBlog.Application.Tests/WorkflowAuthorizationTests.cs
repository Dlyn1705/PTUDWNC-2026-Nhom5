using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Auth.Admin;
using CulinaryBlog.Application.Features.Recipes.Queries.GetManagedRecipes;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using NSubstitute;
using Xunit;

namespace CulinaryBlog.Application.Tests;

public sealed class WorkflowAuthorizationTests
{
    private readonly ICurrentUserService currentUser = Substitute.For<ICurrentUserService>();

    [Fact]
    public async Task Admin_workflows_enforce_admin_role_outside_http()
    {
        var users = Substitute.For<IAdminUserService>();
        currentUser.IsAuthenticated.Returns(true);
        currentUser.UserId.Returns("author");
        currentUser.IsAdmin.Returns(false);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new ListAdminUsersQueryHandler(users, currentUser).Handle(new(), default));
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new SetAdminUserRoleCommandHandler(users, currentUser)
                .Handle(new("target", "Admin"), default));
        await users.DidNotReceiveWithAnyArgs().ListAsync(default, default, default, default);
        await users.DidNotReceiveWithAnyArgs().SetExclusiveRoleAsync(default!, default!, default, default);
    }

    [Fact]
    public async Task Managed_recipes_require_authenticated_author_or_admin_outside_http()
    {
        var recipes = Substitute.For<IRecipeRepository>();
        currentUser.IsAuthenticated.Returns(true);
        currentUser.UserId.Returns("reader");
        currentUser.Roles.Returns(Array.Empty<string>());

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new GetManagedRecipesQueryHandler(recipes, currentUser).Handle(new(), default));
        await recipes.DidNotReceiveWithAnyArgs().GetPagedAsync(default, default);
    }
}
