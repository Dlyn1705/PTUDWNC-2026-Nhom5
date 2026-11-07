using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Categories.Commands.CreateCategory;
using CulinaryBlog.Application.Features.Categories.Commands.UpdateCategory;
using CulinaryBlog.Application.Features.Categories.Commands.DeleteCategory;
using CulinaryBlog.Application.Features.Categories.Queries.GetCategories;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using NSubstitute;
using Xunit;

namespace CulinaryBlog.Application.Tests;

public sealed class CategoryUseCaseTests
{
    private readonly IUnitOfWork work = Substitute.For<IUnitOfWork>();
    private readonly ICurrentUserService user = Substitute.For<ICurrentUserService>();
    private readonly IPublicContentCache cache = Substitute.For<IPublicContentCache>();

    public CategoryUseCaseTests() => user.IsAdmin.Returns(true);

    [Fact]
    public async Task Create_trims_fields_resolves_slug_collision_and_invalidates_only_after_save()
    {
        work.Categories.ExistsBySlugAsync("mon-ngon", default).Returns(true);
        var result = await new CreateCategoryCommandHandler(work, user, cache).Handle(new("  Món ngon  ", " mô tả ", " https://example.test/a.png ", 2), default);
        Assert.Equal("Món ngon", result.Name);
        Assert.Equal("mon-ngon-2", result.Slug);
        Assert.Equal("mô tả", result.Description);
        Assert.Equal("https://example.test/a.png", result.ImageUrl);
        Received.InOrder(() => { work.SaveChangesAsync(default); cache.InvalidateCategoriesAsync(result.Slug, default); });
    }

    [Fact]
    public async Task Duplicate_name_or_save_failure_never_invalidates_cache()
    {
        work.Categories.ExistsByNameAsync("Món ngon", default).Returns(true);
        var handler = new CreateCategoryCommandHandler(work, user, cache);
        await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(new("Món ngon"), default));
        work.Categories.ExistsByNameAsync("Món ngon", default).Returns(false);
        work.SaveChangesAsync(default).Returns(Task.FromException<int>(new IOException("test DB failure")));
        await Assert.ThrowsAsync<IOException>(() => handler.Handle(new("Món ngon"), default));
        await cache.DidNotReceiveWithAnyArgs().InvalidateCategoriesAsync(default, default);
    }

    [Fact]
    public async Task Mutations_deny_author_before_any_database_write()
    {
        user.IsAdmin.Returns(false);
        await Assert.ThrowsAsync<ForbiddenException>(() => new CreateCategoryCommandHandler(work, user, cache).Handle(new("Món ngon"), default));
        await Assert.ThrowsAsync<ForbiddenException>(() => new UpdateCategoryCommandHandler(work, user, cache).Handle(new(Guid.NewGuid(), "Món ngon"), default));
        await Assert.ThrowsAsync<ForbiddenException>(() => new DeleteCategoryCommandHandler(work, user, cache).Handle(new(Guid.NewGuid()), default));
        await work.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    [Fact]
    public async Task Update_preserves_public_slug_and_returns_total_count()
    {
        var category = Category.Create("Món cũ", "old-link", null, null, 0);
        work.Categories.GetByIdAsync(category.Id, default).Returns(category);
        work.Recipes.CountByCategoryIdAsync(category.Id, default).Returns(3);
        var result = await new UpdateCategoryCommandHandler(work, user, cache).Handle(new(category.Id, " Món mới ", "  ", "  ", 4), default);
        Assert.Equal("old-link", result.Slug);
        Assert.Equal("Món mới", result.Name);
        Assert.Null(result.Description);
        Assert.Null(result.ImageUrl);
        Assert.Equal(3, result.TotalRecipeCount);
    }

    [Fact]
    public async Task Missing_category_and_duplicate_update_do_not_commit()
    {
        var handler = new UpdateCategoryCommandHandler(work, user, cache);
        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(new(Guid.NewGuid(), "Món mới"), default));
        var category = Category.Create("Món cũ", "old-link", null, null, 0);
        work.Categories.GetByIdAsync(category.Id, default).Returns(category);
        work.Categories.ExistsByNameAsync("Món mới", default).Returns(true);
        await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(new(category.Id, "Món mới"), default));
        await work.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    [Fact]
    public async Task Delete_refuses_any_linked_recipe_and_soft_deletes_only_empty_category()
    {
        var handler = new DeleteCategoryCommandHandler(work, user, cache);
        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(new(Guid.NewGuid()), default));
        var category = Category.Create("Món cũ", "old-link", null, null, 0);
        work.Categories.GetByIdAsync(category.Id, default).Returns(category);
        work.Recipes.CountByCategoryIdAsync(category.Id, default).Returns(1);
        await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(new(category.Id), default));
        work.Categories.DidNotReceive().Delete(category);
        work.Recipes.CountByCategoryIdAsync(category.Id, default).Returns(0);
        Assert.True(await handler.Handle(new(category.Id), default));
        work.Categories.Received(1).Delete(category);
        await work.Received(1).SaveChangesAsync(default);
    }

    [Theory]
    [InlineData("", null, 0, false)]
    [InlineData("!", null, 0, false)]
    [InlineData("Món ngon", "javascript:alert(1)", 0, false)]
    [InlineData("Món ngon", null, -1, false)]
    [InlineData("Món ngon", "https://example.test/a.png", 0, true)]
    [InlineData(" Món ngon ", " ", 2, true)]
    public void Category_validators_enforce_both_create_and_update(string name, string? image, int order, bool expected)
    {
        Assert.Equal(expected, new CreateCategoryCommandValidator().Validate(new CreateCategoryCommand(name, ImageUrl: image, OrderIndex: order)).IsValid);
        Assert.Equal(expected, new UpdateCategoryCommandValidator().Validate(new UpdateCategoryCommand(Guid.NewGuid(), name, ImageUrl: image, OrderIndex: order)).IsValid);
        Assert.False(new UpdateCategoryCommandValidator().Validate(new UpdateCategoryCommand(Guid.Empty, "Món ngon")).IsValid);
    }

    [Fact]
    public async Task Admin_query_bypasses_public_cache_and_does_not_mutate()
    {
        var category = Category.Create("Món ngon", "mon-ngon", null, null, 0);
        work.Categories.GetAllWithRecipeCountAsync(default).Returns(new List<(Category, int, int)> { (category, 2, 5) });
        var result = Assert.Single(await new GetCategoriesQueryHandler(work, user, cache).Handle(new(), default));
        Assert.Equal(2, result.RecipeCount);
        Assert.Equal(5, result.TotalRecipeCount);
        await work.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }
}
