using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Auth.Admin;
using CulinaryBlog.Application.Features.Recipes.Queries.GetManagedRecipes;
using CulinaryBlog.Application.Features.Recipes.Queries.GetProfileRecipeStats;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using NSubstitute;
using Xunit;

namespace CulinaryBlog.Application.Tests;

public sealed class WorkflowBoundaryTests
{
    private readonly ICurrentUserService user = Substitute.For<ICurrentUserService>();
    private readonly IRecipeRepository recipes = Substitute.For<IRecipeRepository>();
    private readonly IAdminUserService users = Substitute.For<IAdminUserService>();

    private void SignIn(bool admin = false)
    {
        user.IsAuthenticated.Returns(true);
        user.UserId.Returns("requester");
        user.IsAdmin.Returns(admin);
        user.Roles.Returns(new[] { admin ? "Admin" : "Author" });
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Managed_listing_enforces_owner_scope_and_preserves_paging_and_media(bool admin)
    {
        SignIn(admin);
        var recipe = Recipe.Create("Test", "test", "Description", null, 1, 2, 3,
            RecipeDifficulty.Easy, Guid.NewGuid(), "requester");
        recipe.Category = Category.Create("Category", "category");
        recipe.Author = new ApplicationUser { Id = "requester", DisplayName = "Chef" };
        var removed = RecipeImage.Create(recipe.Id, "https://example.invalid/deleted", "Deleted", true);
        removed.IsDeleted = true;
        recipe.Images.Add(removed);
        recipe.Images.Add(RecipeImage.Create(recipe.Id, "https://example.invalid/original", "Visible", true));
        recipes.GetPagedAsync(default, default).ReturnsForAnyArgs(((IReadOnlyList<Recipe>)new[] { recipe }, 123));

        var result = await new GetManagedRecipesQueryHandler(recipes, user)
            .Handle(new(0, 100, RecipeStatus.Draft, "title"), default);
        var dto = Assert.Single(result.Data);
        Assert.Equal(recipe.Id, dto.Id);
        Assert.Equal("Test", dto.Title);
        Assert.Equal("test", dto.Slug);
        Assert.Equal("Description", dto.Description);
        Assert.Equal(RecipeStatus.Draft, dto.Status);
        Assert.Equal(recipe.UpdatedAt, dto.UpdatedAt);
        Assert.Equal(recipe.Category.Id, dto.Category!.Id);
        Assert.Equal("Category", dto.Category.Name);
        Assert.Equal("requester", dto.Author!.Id);
        Assert.Equal("Chef", dto.Author.DisplayName);
        Assert.Equal("https://example.invalid/original", dto.PrimaryImageUrl);
        Assert.Equal(1, result.Meta.Page);
        Assert.Equal(50, result.Meta.PageSize);
        Assert.Equal(123, result.Meta.TotalCount);
        Assert.Equal(3, result.Meta.TotalPages);
        Assert.True(result.Meta.HasNextPage);
        Assert.False(result.Meta.HasPreviousPage);
        await recipes.Received(1).GetPagedAsync(1, 50, sortBy: "title",
            authorId: admin ? null : "requester", includeDrafts: true, status: RecipeStatus.Draft);
    }

    [Fact]
    public async Task Managed_listing_tolerates_missing_related_rows_without_inventing_media()
    {
        SignIn();
        var recipe = Recipe.Create("Test", "test", "Description", null, 1, 2, 3,
            RecipeDifficulty.Easy, Guid.NewGuid(), "requester");
        recipes.GetPagedAsync(default, default).ReturnsForAnyArgs(((IReadOnlyList<Recipe>)new[] { recipe }, 1));
        var dto = Assert.Single((await new GetManagedRecipesQueryHandler(recipes, user).Handle(new(), default)).Data);
        Assert.Null(dto.Category); Assert.Null(dto.Author); Assert.Null(dto.PrimaryImageUrl);
    }

    [Fact]
    public async Task Profile_counts_are_always_scoped_to_requester_even_for_administrator()
    {
        SignIn(true);
        recipes.GetPagedAsync(1, 1, authorId: "requester", includeDrafts: true)
            .Returns((Array.Empty<Recipe>(), 7));
        recipes.GetPagedAsync(1, 1, authorId: "requester", includeDrafts: true, status: RecipeStatus.Published)
            .Returns((Array.Empty<Recipe>(), 3));
        var result = await new GetProfileRecipeStatsQueryHandler(recipes, user).Handle(new(), default);
        Assert.Equal(7, result.Created); Assert.Equal(3, result.Published);
        Assert.Equal(2, recipes.ReceivedCalls().Count());
    }

    [Fact]
    public async Task Anonymous_workflows_do_not_reach_persistence()
    {
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => new GetManagedRecipesQueryHandler(recipes, user).Handle(new(), default));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => new GetProfileRecipeStatsQueryHandler(recipes, user).Handle(new(), default));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => new ListAdminUsersQueryHandler(users, user).Handle(new(), default));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => new SetAdminUserRoleCommandHandler(users, user).Handle(new("target", "Admin"), default));
        Assert.Empty(recipes.ReceivedCalls()); Assert.Empty(users.ReceivedCalls());
    }

    [Theory]
    [InlineData(0, 20, null)]
    [InlineData(1, 0, null)]
    [InlineData(1, 51, null)]
    [InlineData(1, 20, "Guest")]
    [InlineData(1, 20, " ")]
    public async Task Invalid_admin_filters_are_rejected_before_service(int page, int size, string? role)
    {
        SignIn(true);
        await Assert.ThrowsAsync<ValidationException>(() => new ListAdminUsersQueryHandler(users, user).Handle(new(page, size, role), default));
        Assert.Empty(users.ReceivedCalls());
    }

    [Fact]
    public async Task Valid_admin_requests_trim_roles_and_propagate_requester_identity()
    {
        SignIn(true);
        var dto = new AdminUserDto("target", "target@example.invalid", "Target", new[] { "Author" }, true, DateTime.UnixEpoch);
        var page = new PagedResult<AdminUserDto>(new[] { dto }, 1, 2, 10);
        users.ListAsync(2, 10, "Author", default).Returns(page);
        users.SetExclusiveRoleAsync("target", "Author", "requester", default).Returns(dto);
        var listed = await new ListAdminUsersQueryHandler(users, user).Handle(new(2, 10, " Author "), default);
        Assert.Same(page, listed);
        var changed = await new SetAdminUserRoleCommandHandler(users, user).Handle(new("target", " Author "), default);
        Assert.Same(dto, changed);
        Assert.Equal("target", changed.Id); Assert.Equal("target@example.invalid", changed.Email);
        Assert.Equal("Target", changed.DisplayName); Assert.Equal("Author", Assert.Single(changed.Roles));
        Assert.True(changed.IsActive); Assert.Equal(DateTime.UnixEpoch, changed.CreatedAt);
        await users.Received(1).SetExclusiveRoleAsync("target", "Author", "requester", default);
    }

    [Theory]
    [InlineData("Guest")]
    [InlineData("")]
    public async Task Invalid_role_change_never_reaches_service(string role)
    {
        SignIn(true);
        await Assert.ThrowsAsync<ValidationException>(() => new SetAdminUserRoleCommandHandler(users, user).Handle(new("target", role), default));
        Assert.Empty(users.ReceivedCalls());
    }
}
