using CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipe;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Exceptions;
using FluentValidation;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipeNutrition;

public sealed record UpdateRecipeNutritionCommand(
    Guid Id,
    decimal? Calories,
    decimal? Protein,
    decimal? Carbohydrates,
    decimal? Fat,
    decimal? Fiber,
    decimal? Sodium,
    string? RowVersion = null,
    string? IfMatch = null) : IRequest<UpdatedRecipe>;

public sealed class UpdateRecipeNutritionCommandValidator : AbstractValidator<UpdateRecipeNutritionCommand>
{
    public UpdateRecipeNutritionCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x).Custom((request, context) =>
        {
            var values = new (string Key, decimal? Value)[]
            {
                ("Calories", request.Calories),
                ("Protein", request.Protein),
                ("Carbohydrates", request.Carbohydrates),
                ("Fat", request.Fat),
                ("Fiber", request.Fiber),
                ("Sodium", request.Sodium)
            };
            foreach (var (key, value) in values)
            {
                if (value is { } number && (number < 0 || number > 999999.99m || decimal.Round(number, 2) != number))
                    context.AddFailure(key, $"{key}: giá trị phải từ 0 đến 999999.99, tối đa 2 chữ số thập phân.");
            }
        });
    }
}

public sealed class UpdateRecipeNutritionCommandHandler(
    ICurrentUserService user,
    IRecipeUpdateStore store) : IRequestHandler<UpdateRecipeNutritionCommand, UpdatedRecipe>
{
    public async Task<UpdatedRecipe> Handle(UpdateRecipeNutritionCommand request, CancellationToken cancellationToken)
    {
        if (!user.IsAuthenticated || string.IsNullOrWhiteSpace(user.UserId))
            throw new UnauthorizedAccessException("Vui lòng đăng nhập.");
        if (!user.IsAdmin && !user.Roles.Contains("Author")) throw new ForbiddenException();

        var recipe = await store.GetAsync(request.Id, cancellationToken);
        if (recipe is null || recipe.IsDeleted) throw new NotFoundException("Recipe", request.Id);
        if (!user.IsAdmin && recipe.AuthorId != user.UserId)
            throw new ForbiddenException("Bạn chỉ được cập nhật công thức do chính mình tạo.");

        var expectedVersion = RecipeUpdateVersion.Parse(request.RowVersion, request.IfMatch);
        recipe.SetNutrition(request.Calories, request.Protein, request.Carbohydrates,
            request.Fat, request.Fiber, request.Sodium);
        return await store.SaveNutritionAsync(recipe, expectedVersion, user.UserId, cancellationToken);
    }
}
