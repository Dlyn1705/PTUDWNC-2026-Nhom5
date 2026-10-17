using FluentValidation;

namespace CulinaryBlog.Application.Features.Recipes.Commands.UploadRecipeImage;

public sealed class UploadRecipeImageCommandValidator : AbstractValidator<UploadRecipeImageCommand>
{
    public UploadRecipeImageCommandValidator()
    {
        RuleFor(x => x.RecipeId).NotEmpty();
        RuleFor(x => x.Content).NotNull();
        RuleFor(x => x.Length).GreaterThan(0).LessThanOrEqualTo(5 * 1024 * 1024);
        RuleFor(x => x.AltText).MaximumLength(200);
    }
}
