using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Commands.CreateRecipe;
using CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipe;
using CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipeNutrition;
using CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipe;
using CulinaryBlog.Application.Features.Recipes.Ingredients;
using CulinaryBlog.Application.Features.Recipes.Steps;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using NSubstitute;
using Xunit;

namespace CulinaryBlog.Application.Tests;

public sealed class RecipeCommandTests
{
    private readonly ICurrentUserService user = Substitute.For<ICurrentUserService>();
    private readonly IRecipeUpdateStore updates = Substitute.For<IRecipeUpdateStore>();
    private readonly IUnitOfWork work = Substitute.For<IUnitOfWork>();
    private readonly string version = Convert.ToBase64String(new byte[16]);
    private readonly Recipe recipe = Recipe.Create("Món ngon", "mon-ngon", "", null, 1, 2, 2, RecipeDifficulty.Easy, Guid.NewGuid(), "owner");
    public RecipeCommandTests() { user.IsAuthenticated.Returns(true); user.UserId.Returns("owner"); user.Roles.Returns(new[] { "Author" }); updates.GetAsync(recipe.Id, default).Returns(recipe); }

    [Fact]
    public async Task Create_composes_children_and_nutrition_with_owner_and_draft_state()
    {
        var store = Substitute.For<IRecipeCreationStore>();
        var command = new CreateRecipeCommand(" Phở ngon ", " mô tả ", " Nấu ", 1, 2, 2, RecipeDifficulty.Easy, recipe.CategoryId,
            [new(" Nước ", 1, " l ", null)], [new(" Nấu chín ", null, 2, null)], new(100, 1, 2, 3, 4, 5));
        await new CreateRecipeCommandHandler(user, store).Handle(command, default);
        var saved = (Recipe)Assert.Single(store.ReceivedCalls()).GetArguments()[0]!;
        Assert.Equal("owner", saved.AuthorId); Assert.Equal(RecipeStatus.Draft, saved.Status);
        Assert.Equal("pho-ngon", saved.Slug); Assert.Equal("Nước", Assert.Single(saved.Ingredients).Name);
        Assert.Equal("Nấu chín", Assert.Single(saved.Steps).Description); Assert.Equal(100, saved.Nutrition.Calories);
        user.IsAuthenticated.Returns(false);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => new CreateRecipeCommandHandler(user, store).Handle(command, default));
        user.IsAuthenticated.Returns(true); user.Roles.Returns(Array.Empty<string>());
        await Assert.ThrowsAsync<ForbiddenException>(() => new CreateRecipeCommandHandler(user, store).Handle(command, default));
    }

    [Fact]
    public async Task Update_and_nutrition_preserve_version_and_enforce_owner_before_save()
    {
        var command = new UpdateRecipeCommand(recipe.Id, " Phở mới ", " mô tả ", " Nấu ", 2, 3, 4, RecipeDifficulty.Medium, recipe.CategoryId, version);
        Assert.True(new UpdateRecipeCommandValidator().Validate(command).IsValid);
        Assert.False(new UpdateRecipeCommandValidator().Validate(command with { Id = Guid.Empty, Title = "", PrepTime = -1, CookTime = -1, Servings = 0, CategoryId = Guid.Empty }).IsValid);
        await new UpdateRecipeCommandHandler(user, updates).Handle(command, default);
        Assert.Equal("pho-moi", recipe.Slug);
        await updates.Received().SaveAsync(recipe, Arg.Is<byte[]>(x => x.SequenceEqual(new byte[16])), "owner", default);
        var nutrition = new UpdateRecipeNutritionCommand(recipe.Id, 10, 1, 2, 3, 4, 5, version);
        await new UpdateRecipeNutritionCommandHandler(user, updates).Handle(nutrition, default);
        Assert.Equal(10, recipe.Nutrition.Calories);
        user.UserId.Returns("other");
        await Assert.ThrowsAsync<ForbiddenException>(() => new UpdateRecipeCommandHandler(user, updates).Handle(command, default));
        await Assert.ThrowsAsync<ForbiddenException>(() => new UpdateRecipeNutritionCommandHandler(user, updates).Handle(nutrition, default));
        user.UserId.Returns("owner"); user.IsAuthenticated.Returns(false);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => new UpdateRecipeCommandHandler(user, updates).Handle(command, default));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => new UpdateRecipeNutritionCommandHandler(user, updates).Handle(nutrition, default));
        user.IsAuthenticated.Returns(true); recipe.IsDeleted = true;
        await Assert.ThrowsAsync<NotFoundException>(() => new UpdateRecipeCommandHandler(user, updates).Handle(command, default));
        await Assert.ThrowsAsync<NotFoundException>(() => new UpdateRecipeNutritionCommandHandler(user, updates).Handle(nutrition, default));
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("bad", null)]
    [InlineData(null, "W/\"AA==\"")]
    [InlineData("AA==", "\"AQ==\"")]
    public void Update_version_rejects_missing_weak_invalid_or_conflicting_tokens(string? body, string? header) =>
        Assert.Throws<ValidationException>(() => RecipeUpdateVersion.Parse(body, header));

    [Fact]
    public void Update_version_accepts_one_strong_matching_token() => Assert.Equal(new byte[16], RecipeUpdateVersion.Parse(version, $"\"{version}\""));

    [Fact]
    public void Oversized_update_tokens_are_rejected_before_accepting_client_version()
    {
        Assert.Throws<ValidationException>(() => RecipeUpdateVersion.Parse(new string('A', 1025), null));
        Assert.Throws<ValidationException>(() => RecipeUpdateVersion.Parse(Convert.ToBase64String(new byte[129]), null));
    }

    [Fact]
    public async Task Child_mutations_reject_missing_payload_and_invalid_version_before_store_write()
    {
        work.Recipes.GetDetailsByIdAsync(recipe.Id, default).Returns(recipe);
        work.Recipes.GetByIdAsync(recipe.Id, default).Returns(recipe);
        var ingredients = Substitute.For<IRecipeIngredientStore>(); var steps = Substitute.For<IRecipeStepStore>();
        var ingredientHandler = new IngredientRequestsHandler(work.Recipes, user, ingredients);
        var stepHandler = new StepRequestsHandler(work.Recipes, user, steps);
        await Assert.ThrowsAsync<ValidationException>(() => ingredientHandler.Handle(new ChangeRecipeIngredientsCommand(new(recipe.Id, IngredientOperation.Add, new byte[16])), default));
        await Assert.ThrowsAsync<ValidationException>(() => ingredientHandler.Handle(new ChangeRecipeIngredientsCommand(new(recipe.Id, IngredientOperation.Delete, [])), default));
        await Assert.ThrowsAsync<ValidationException>(() => stepHandler.Handle(new ChangeRecipeStepsCommand(new(recipe.Id, StepOperation.Add, [])), default));
        await Assert.ThrowsAsync<ValidationException>(() => stepHandler.Handle(new ChangeRecipeStepsCommand(new(recipe.Id, StepOperation.Add, new byte[16])), default));
        await ingredients.DidNotReceiveWithAnyArgs().MutateAsync(default!, default);
        await steps.DidNotReceiveWithAnyArgs().MutateAsync(default!, default);
    }

    [Fact]
    public async Task Delete_commits_soft_delete_before_invalidation_and_does_not_touch_storage()
    {
        work.Recipes.GetByIdAsync(recipe.Id, default).Returns(recipe);
        var cache = Substitute.For<IRecipeCacheInvalidator>();
        await new DeleteRecipeCommandHandler(work, user, cache).Handle(new(recipe.Id), default);
        Assert.True(recipe.IsDeleted);
        Received.InOrder(() => { work.SaveChangesAsync(default); cache.InvalidateRecipeAsync(recipe.Id, recipe.Slug, default); });
        await Assert.ThrowsAsync<NotFoundException>(() => new DeleteRecipeCommandHandler(work, user, cache).Handle(new(recipe.Id), default));
    }

    [Fact]
    public async Task Child_handlers_authorize_before_mutating_and_share_expected_recipe_version()
    {
        work.Recipes.GetDetailsByIdAsync(recipe.Id, default).Returns(recipe);
        work.Recipes.GetByIdAsync(recipe.Id, default).Returns(recipe);
        var ingredients = Substitute.For<IRecipeIngredientStore>(); var steps = Substitute.For<IRecipeStepStore>();
        var ingredientHandler = new IngredientRequestsHandler(work.Recipes, user, ingredients);
        var stepHandler = new StepRequestsHandler(work.Recipes, user, steps);
        await ingredientHandler.Handle(new GetRecipeIngredientsQuery(recipe.Id), default);
        await stepHandler.Handle(new GetRecipeStepsQuery(recipe.Id), default);
        await ingredientHandler.Handle(new ChangeRecipeIngredientsCommand(new(recipe.Id, IngredientOperation.Add, new byte[16], Input: new("Nước", 1))), default);
        await stepHandler.Handle(new ChangeRecipeStepsCommand(new(recipe.Id, StepOperation.Add, new byte[16], Input: new("Nấu"))), default);
        await stepHandler.Handle(new PublishRecipeWithStepsCommand(recipe.Id), default);
        await steps.Received(1).PublishAsync(recipe.Id, default);
        user.UserId.Returns("other");
        await Assert.ThrowsAsync<ForbiddenException>(() => ingredientHandler.Handle(new GetRecipeIngredientsQuery(recipe.Id), default));
        await Assert.ThrowsAsync<ForbiddenException>(() => stepHandler.Handle(new GetRecipeStepsQuery(recipe.Id), default));
        Assert.Throws<ValidationException>(() => IngredientRules.Validate(new IngredientInput("", -1, new string('x', 51), new string('x', 501))));
        Assert.Equal(recipe.Id, IngredientRules.ToDto(new RecipeIngredient { RecipeId = recipe.Id, Name = "Nước" }).RecipeId);
    }
}
