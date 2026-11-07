using System.Text.Json;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Auth;
using CulinaryBlog.Application.Features.Auth.Commands.Register;
using CulinaryBlog.Application.Features.Auth.Commands.Login;
using CulinaryBlog.Application.Features.Recipes.Commands.CreateRecipe;
using CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipeNutrition;
using CulinaryBlog.Application.Features.Recipes.Queries.SearchRecipes;
using CulinaryBlog.Application.Features.Recipes.Steps;
using CulinaryBlog.Domain.Enums;
using Xunit;

namespace CulinaryBlog.Application.Tests;

public sealed class ValidationBoundaryTests
{
    [Fact]
    public void Registration_and_login_reject_malformed_identity_but_accept_strong_credentials()
    {
        var valid = new RegisterCommand("chef@example.test", "Chef", "Safe-Password1!", "Safe-Password1!");
        var validator = new RegisterCommandValidator();
        Assert.True(validator.Validate(valid).IsValid);
        foreach (var value in new[] { valid with { Email = "" }, valid with { Email = "wrong" }, valid with { Email = new string('a', 257) + "@test.test" },
            valid with { DisplayName = "" }, valid with { DisplayName = "a" }, valid with { DisplayName = new string('a', 101) },
            valid with { Password = "" }, valid with { Password = "Short1!" }, valid with { Password = "lowercase1!" },
            valid with { Password = "UPPERCASE1!" }, valid with { Password = "NoNumber!!" }, valid with { Password = "NoSymbol123" }, valid with { ConfirmPassword = "different" } })
            Assert.False(validator.Validate(value).IsValid);
        Assert.True(new LoginCommandValidator().Validate(new LoginCommand("chef@example.test", "Safe-Password1!")).IsValid);
        Assert.False(new LoginCommandValidator().Validate(new LoginCommand("bad", "")).IsValid);
    }

    [Fact]
    public void Profile_and_password_validation_do_not_accept_empty_updates_or_unsafe_urls()
    {
        var profile = new UpdateProfileValidator();
        Assert.False(profile.Validate(new UpdateProfileDto(null, null, null)).IsValid);
        Assert.True(profile.Validate(new UpdateProfileDto("Chef", "Bio", "https://example.test/a.png")).IsValid);
        Assert.False(profile.Validate(new UpdateProfileDto("x", new string('b', 1001), "javascript:alert(1)")).IsValid);
        var password = new ChangePasswordValidator();
        Assert.True(password.Validate(new ChangePasswordDto("Old-Password1!", "New-Password2!")).IsValid);
        Assert.False(password.Validate(new ChangePasswordDto("", "short")).IsValid);
        Assert.False(password.Validate(new ChangePasswordDto("Same-Password1!", "Same-Password1!")).IsValid);
    }

    [Fact]
    public void Create_validates_nested_limits_and_all_six_nutrition_fields_without_rounding()
    {
        var validator = new CreateRecipeCommandValidator();
        var valid = new CreateRecipeCommand("Món ngon", null, null, 1, 2, 2, RecipeDifficulty.Easy, Guid.NewGuid(),
            [new("Nước", 1, "l", null)], [new("Nấu chín", "Nấu", 2, "https://example.test/step.png")], new(1, 2, 3, 4, 5, 6));
        Assert.True(validator.Validate(valid).IsValid);
        var invalid = valid with { Title = "x", Description = new string('a', 2001), Instructions = new string('a', 10001),
            PrepTime = -1, CookTime = -1, Servings = 0, CategoryId = Guid.Empty, Difficulty = (RecipeDifficulty)99,
            Ingredients = [null, new("", 0, new string('u', 51), new string('n', 501))],
            Steps = [null, new("", new string('t', 201), -1, "javascript:x")], Nutrition = new(-1, 1000000, .001m, -1, -1, -1) };
        var errors = validator.Validate(invalid).Errors;
        Assert.True(errors.Count >= 20);
        Assert.False(validator.Validate(valid with { Ingredients = Enumerable.Repeat<NewRecipeIngredient?>(new("A", 1, null, null), 101).ToArray(),
            Steps = Enumerable.Repeat<NewRecipeStep?>(new("Nấu", null, null), 101).ToArray() }).IsValid);
        Assert.False(new UpdateRecipeNutritionCommandValidator().Validate(new UpdateRecipeNutritionCommand(Guid.Empty, -1, -1, -1, -1, -1, -1)).IsValid);
        Assert.True(new UpdateRecipeNutritionCommandValidator().Validate(new UpdateRecipeNutritionCommand(Guid.NewGuid(), null, 0, 1.25m, 0, 0, 0)).IsValid);
    }

    [Theory]
    [InlineData("{\"description\":\" Nấu chín \",\"title\":null,\"timerMinutes\":2,\"imageUrl\":null}")]
    [InlineData("{\"description\":\"Nấu\",\"title\":\"Bước\",\"imageUrl\":\"https://example.test/a.png\"}")]
    public void Step_parser_and_apply_keep_nullable_fields_and_trim_user_text(string json)
    {
        using var document = JsonDocument.Parse(json);
        var input = StepRules.Parse(document.RootElement);
        var step = CulinaryBlog.Domain.Entities.RecipeStep.Create(Guid.NewGuid(), 1, "Old", "Old");
        StepRules.Apply(step, input);
        Assert.Equal(input.Description!.Trim(), step.Description);
        Assert.Equal(step.Id, StepRules.ToDto(step).Id);
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("{\"description\":1}")]
    [InlineData("{\"description\":\"a\",\"description\":\"b\"}")]
    [InlineData("{\"stepNumber\":2}")]
    [InlineData("{\"timerMinutes\":1.5}")]
    public void Step_parser_rejects_ambiguous_or_server_owned_fields(string json)
    {
        using var document = JsonDocument.Parse(json);
        Assert.Throws<CulinaryBlog.Domain.Exceptions.ValidationException>(() => StepRules.Parse(document.RootElement));
    }

    [Fact]
    public void Search_validator_checks_pagination_range_and_legacy_filter_conflicts()
    {
        var validator = new SearchRecipesQueryValidator();
        Assert.True(validator.Validate(new SearchRecipesQuery(Q: "phở", Servings: 2, MinServings: 2, MaxServings: 2)).IsValid);
        var invalid = new SearchRecipesQuery(Q: "x", Page: 0, PageSize: 0, CategoryId: Guid.Empty, Difficulty: (RecipeDifficulty)99,
            MinCookTime: -1, MaxCookTime: -2, MinServings: 0, MaxServings: -1, SortBy: "unknown", SortOrder: "bad", Sort: "bad", Servings: 3);
        Assert.False(validator.Validate(invalid).IsValid);
        Assert.False(validator.Validate(new SearchRecipesQuery(Q: new string('x', 101), Page: int.MaxValue)).IsValid);
    }
}
