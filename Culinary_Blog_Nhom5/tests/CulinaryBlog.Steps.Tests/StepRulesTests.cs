using CulinaryBlog.Application.Features.Recipes.Steps;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using Xunit;

namespace CulinaryBlog.Steps.Tests;

public sealed class StepRulesTests
{
    [Fact]
    public void Boundary_validation_matches_schema_and_keeps_zero_timer()
    {
        StepRules.Validate(new StepInput(new string('d', 2000), new string('t', 200), 0));
        Assert.Throws<ValidationException>(() => StepRules.Validate(new StepInput(new string('d', 2001))));
        Assert.Throws<ValidationException>(() => StepRules.Validate(new StepInput("OK", new string('t', 201))));
        Assert.Throws<ValidationException>(() => StepRules.Validate(new StepInput("OK", ImageUrl: "https://example.invalid/" + new string('a', 500))));
        var step = RecipeStep.Create(Guid.NewGuid(), 3, "", "");
        StepRules.Apply(step, new StepInput("  Trộn  ", " ", 0, " "));
        Assert.Equal("Bước 3", step.Title); Assert.Equal("Trộn", step.Description); Assert.Null(step.ImageUrl); Assert.Equal(0, step.TimerMinutes);
    }

    [Fact]
    public void Publish_ignores_a_deleted_child_even_when_still_tracked()
    {
        var recipe = new Recipe();
        recipe.Steps.Add(new RecipeStep { IsDeleted = true });
        Assert.Throws<DomainException>(() => recipe.Publish());
    }
}
