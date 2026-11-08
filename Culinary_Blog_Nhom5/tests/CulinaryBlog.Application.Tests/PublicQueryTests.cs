using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Recipes.Queries.SearchRecipes;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeBySlug;
using CulinaryBlog.Application.Features.Recipes.Queries.GetPublicRecipes;
using CulinaryBlog.Application.Features.Categories.Queries.GetCategoryBySlug;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using NSubstitute;
using Xunit;

namespace CulinaryBlog.Application.Tests;

public sealed class PublicQueryTests
{
    private readonly IUnitOfWork work = Substitute.For<IUnitOfWork>();
    private readonly ICurrentUserService user = Substitute.For<ICurrentUserService>();
    private readonly PassThroughCache cache = new();

    private static Recipe Sample()
    {
        var category = Category.Create("Món nước", "mon-nuoc");
        var recipe = Recipe.Create("Phở bò", "pho-bo", "Món Việt", "Nấu", 5, 10, 2, RecipeDifficulty.Easy, category.Id, "owner");
        recipe.Category = category; recipe.Author = new ApplicationUser { Id = "owner", DisplayName = "Chef", Bio = "Bio" };
        recipe.Images.Add(RecipeImage.Create(recipe.Id, "https://example.test/original.png", "Phở", true));
        recipe.Steps.Add(RecipeStep.Create(recipe.Id, 1, "Nấu", "Nấu chín"));
        recipe.Ingredients.Add(new RecipeIngredient { Name = "Nước", Quantity = 1, Unit = "l", RecipeId = recipe.Id });
        return recipe;
    }

    [Theory]
    [InlineData(null, null, null)]
    [InlineData("title", "asc", null)]
    [InlineData("relevance", "asc", "-title")]
    [InlineData(null, null, "-createdAt")]
    [InlineData(null, null, "title")]
    public async Task Search_normalizes_vietnamese_and_maps_only_repository_results(string? sortBy, string? order, string? legacy)
    {
        var recipe = Sample();
        work.Recipes.SearchRecipesAsync(default!, default, default).ReturnsForAnyArgs(
            ((IReadOnlyList<Recipe>)new[] { recipe }, 1, (IReadOnlyDictionary<Guid, double>)new Dictionary<Guid, double> { [recipe.Id] = .75 }));
        var result = await new SearchRecipesQueryHandler(work, cache).Handle(new(Q: "  PHỞ, bò! ", SortBy: sortBy, SortOrder: order, Sort: legacy, Servings: 2), default);
        var row = Assert.Single(result.Data!.Data);
        Assert.Equal(recipe.Id, row.Id);
        Assert.Equal(.75, row.RelevanceScore);
        var call = Assert.Single(work.Recipes.ReceivedCalls().Where(x => x.GetMethodInfo().Name == "SearchRecipesAsync"));
        Assert.Equal("'pho':* & 'bo':*", call.GetArguments()[0]);
        Assert.Equal(2, call.GetArguments()[7]); Assert.Equal(2, call.GetArguments()[8]);
        Assert.Equal(0, cache.Invalidations);
        await work.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    [Theory]
    [InlineData("")]
    [InlineData("!!!")]
    public async Task Empty_search_never_queries_repository(string keyword)
    {
        var response = await new SearchRecipesQueryHandler(work, cache).Handle(new(Q: keyword), default);
        Assert.Empty(response.Data!.Data);
        Assert.Empty(work.Recipes.ReceivedCalls());
    }

    [Theory]
    [InlineData(false, false, false)]
    [InlineData(true, false, false)]
    [InlineData(true, true, false)]
    [InlineData(true, false, true)]
    public async Task Draft_detail_is_hidden_from_guest_and_other_author_but_owner_or_admin_can_view(bool authenticated, bool owner, bool admin)
    {
        var recipe = Sample();
        user.IsAuthenticated.Returns(authenticated); user.UserId.Returns(owner ? "owner" : "other"); user.IsAdmin.Returns(admin);
        work.Recipes.GetBySlugAsync("pho-bo", default).Returns(recipe);
        var handler = new GetRecipeBySlugQueryHandler(work, user, cache);
        if (!authenticated || (!owner && !admin)) await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(new("pho-bo"), default));
        else { var dto = await handler.Handle(new("pho-bo"), default); Assert.Equal(recipe.Id, dto.Id); Assert.Single(dto.Ingredients); Assert.Single(dto.Steps); }
        Assert.Equal(0, cache.Invalidations);
    }

    [Fact]
    public async Task Published_detail_and_listing_map_media_and_hide_deleted_record()
    {
        var recipe = Sample(); recipe.Status = RecipeStatus.Published;
        work.Recipes.GetBySlugAsync("pho-bo", default).Returns(recipe);
        var detail = new GetRecipeBySlugQueryHandler(work, user, cache);
        Assert.Single((await detail.Handle(new("pho-bo"), default)).Images);
        work.Recipes.GetPagedAsync(default, default).ReturnsForAnyArgs(((IReadOnlyList<Recipe>)new[] { recipe }, 1));
        var listing = await new GetPublicRecipesQueryHandler(work, cache).Handle(new(Page: 0, PageSize: 100, SortBy: "title", SortOrder: "asc"), default);
        Assert.Single(listing.Data);
        recipe.IsDeleted = true;
        await Assert.ThrowsAsync<NotFoundException>(() => detail.Handle(new("pho-bo"), default));
        await work.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    [Fact]
    public async Task Category_detail_paginates_and_maps_children_without_mutation()
    {
        var recipe = Sample();
        work.Categories.GetBySlugAsync("mon-nuoc", default).Returns(recipe.Category);
        work.Recipes.GetPagedAsync(default, default).ReturnsForAnyArgs(((IReadOnlyList<Recipe>)new[] { recipe }, 1));
        var handler = new GetCategoryBySlugQueryHandler(work, cache);
        var detail = await handler.Handle(new("mon-nuoc", 0, 100), default);
        Assert.Equal(recipe.CategoryId, detail.Category.Id);
        Assert.Equal(recipe.Id, Assert.Single(detail.Recipes.Data).Id);
        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(new("missing", 1, 12), default));
        await work.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    internal sealed class PassThroughCache : IPublicContentCache
    {
        public int Invalidations;
        public Task<PagedResult<SearchRecipeSummaryDto>> GetSearchAsync(string key, Func<CancellationToken, Task<PagedResult<SearchRecipeSummaryDto>>> factory, CancellationToken ct = default) => factory(ct);
        public Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(Func<CancellationToken, Task<IReadOnlyList<CategoryDto>>> factory, CancellationToken ct = default) => factory(ct);
        public Task<CategoryDetailDto> GetCategoryAsync(string slug, int page, int size, Func<CancellationToken, Task<CategoryDetailDto>> factory, CancellationToken ct = default) => factory(ct);
        public Task<PagedResult<RecipeSummaryDto>> GetRecipesAsync(string key, Func<CancellationToken, Task<PagedResult<RecipeSummaryDto>>> factory, CancellationToken ct = default) => factory(ct);
        public Task<RecipeDetailDto> GetRecipeAsync(string slug, Func<CancellationToken, Task<RecipeDetailDto>> factory, CancellationToken ct = default) => factory(ct);
        public Task InvalidateCategoriesAsync(string? slug = null, CancellationToken cancellationToken = default) { Invalidations++; return Task.CompletedTask; }
        public Task InvalidateRecipesAsync(Guid? recipeId = null, string? slug = null, CancellationToken cancellationToken = default) { Invalidations++; return Task.CompletedTask; }
    }
}
