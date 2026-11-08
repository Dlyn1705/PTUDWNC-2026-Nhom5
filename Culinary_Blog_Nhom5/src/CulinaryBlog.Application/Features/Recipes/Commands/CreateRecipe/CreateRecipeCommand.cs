using CulinaryBlog.Application.Common.Helpers;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Application.Features.Recipes.Steps;
using FluentValidation;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Commands.CreateRecipe;

public record CreateRecipeCommand(string Title, string? Description, string? Instructions,
    int PrepTime, int CookTime, int Servings, RecipeDifficulty Difficulty, Guid CategoryId,
    IReadOnlyList<NewRecipeIngredient?>? Ingredients = null,
    IReadOnlyList<NewRecipeStep?>? Steps = null, NewRecipeNutrition? Nutrition = null) : IRequest<CreatedRecipe>;
public record NewRecipeIngredient(string Name, decimal? Quantity, string? Unit, string? Notes);
public record NewRecipeStep(string Description, string? Title, int? TimerMinutes, string? ImageUrl = null);
public record NewRecipeNutrition(decimal? Calories, decimal? Protein, decimal? Carbohydrates,
    decimal? Fat, decimal? Fiber, decimal? Sodium);
public record CreatedRecipe(string Message, Guid Id, string Slug, string RowVersion);

public interface IRecipeCreationStore
{
    Task<CreatedRecipe> CreateAsync(Recipe recipe, CancellationToken cancellationToken);
}

public sealed class CreateRecipeCommandValidator : AbstractValidator<CreateRecipeCommand>
{
    public CreateRecipeCommandValidator()
    {
        RuleFor(x => x).Custom((x, context) =>
        {
            void Length(string key, string? value, int min, int max)
            {
                if ((value?.Trim().Length ?? 0) < min || (value?.Trim().Length ?? 0) > max)
                    context.AddFailure(key, $"{key}: độ dài phải từ {min} đến {max} ký tự.");
            }
            void Number(string key, decimal? value, decimal min, decimal max, int precision)
            {
                if (value is { } n && (n < min || n > max || decimal.Round(n, precision) != n))
                    context.AddFailure(key, $"{key}: giá trị phải từ {min} đến {max}, tối đa {precision} chữ số thập phân.");
            }
            Length("Title", x.Title, 3, 200);
            Length("Description", x.Description, 0, 2000);
            Length("Instructions", x.Instructions, 0, 10000);
            if (x.CategoryId == Guid.Empty) context.AddFailure("CategoryId", "Vui lòng chọn danh mục.");
            if (!Enum.IsDefined(x.Difficulty)) context.AddFailure("Difficulty", "Độ khó không hợp lệ.");
            if (x.PrepTime < 0) context.AddFailure("PrepTime", "Thời gian chuẩn bị không được âm.");
            if (x.CookTime < 0) context.AddFailure("CookTime", "Thời gian nấu không được âm.");
            if (x.Servings <= 0) context.AddFailure("Servings", "Số khẩu phần phải lớn hơn 0.");
            if (x.Ingredients?.Count > 100) context.AddFailure("Ingredients", "Tối đa 100 nguyên liệu.");
            if (x.Steps?.Count > 100) context.AddFailure("Steps", "Tối đa 100 bước.");
            for (var i = 0; i < (x.Ingredients?.Count ?? 0); i++)
            {
                var item = x.Ingredients![i];
                var key = $"Ingredients[{i}]";
                if (item is null) { context.AddFailure(key, "Nguyên liệu không được null."); continue; }
                Length(key + ".Name", item.Name, 1, 200);
                Length(key + ".Unit", item.Unit, 0, 50);
                Length(key + ".Notes", item.Notes, 0, 500);
                Number(key + ".Quantity", item.Quantity, 0.001m, 9999999.999m, 3);
            }
            for (var i = 0; i < (x.Steps?.Count ?? 0); i++)
            {
                var item = x.Steps![i];
                var key = $"Steps[{i}]";
                if (item is null) { context.AddFailure(key, "Bước thực hiện không được null."); continue; }
                Length(key + ".Title", item.Title, 0, 200);
                Length(key + ".Description", item.Description, 1, 2000);
                if (item.TimerMinutes < 0) context.AddFailure(key + ".TimerMinutes", "Thời gian không được âm.");
                try { StepRules.Validate(new StepInput(item.Description, item.Title, item.TimerMinutes, item.ImageUrl)); }
                catch (CulinaryBlog.Domain.Exceptions.ValidationException error)
                { context.AddFailure(key, error.Message); }
            }
            if (x.Nutrition is { } n)
            {
                Number("Nutrition.Calories", n.Calories, 0, 999999.99m, 2);
                Number("Nutrition.Protein", n.Protein, 0, 999999.99m, 2);
                Number("Nutrition.Carbohydrates", n.Carbohydrates, 0, 999999.99m, 2);
                Number("Nutrition.Fat", n.Fat, 0, 999999.99m, 2);
                Number("Nutrition.Fiber", n.Fiber, 0, 999999.99m, 2);
                Number("Nutrition.Sodium", n.Sodium, 0, 999999.99m, 2);
            }
        });
    }
}

public sealed class CreateRecipeCommandHandler(ICurrentUserService user, IRecipeCreationStore store)
    : IRequestHandler<CreateRecipeCommand, CreatedRecipe>
{
    public async Task<CreatedRecipe> Handle(CreateRecipeCommand request, CancellationToken cancellationToken)
    {
        if (!user.IsAuthenticated || string.IsNullOrWhiteSpace(user.UserId))
            throw new UnauthorizedAccessException("Không xác định được người dùng đăng nhập.");
        if (!user.Roles.Contains("Author") && !user.IsAdmin) throw new ForbiddenException();

        var title = request.Title.Trim();
        var slug = SlugHelper.Generate(title.Normalize());
        if (slug.Length > 200) slug = slug[..200].TrimEnd('-');
        var recipe = Recipe.Create(title, slug, request.Description?.Trim() ?? "",
            request.Instructions?.Trim(), request.PrepTime, request.CookTime,
            request.Servings, request.Difficulty, request.CategoryId, user.UserId);
        if (string.IsNullOrEmpty(slug)) recipe.Slug = $"recipe-{recipe.Id:N}";
        if (request.Nutrition is { } n)
            recipe.SetNutrition(n.Calories, n.Protein, n.Carbohydrates, n.Fat, n.Fiber, n.Sodium);
        foreach (var item in request.Ingredients ?? [])
            recipe.Ingredients.Add(RecipeIngredient.Create(recipe.Id, item!.Name.Trim(), item.Quantity,
                item.Unit?.Trim(), item.Notes?.Trim(), recipe.Ingredients.Count));
        foreach (var item in request.Steps ?? [])
        {
            var number = recipe.Steps.Count + 1;
            var step = RecipeStep.Create(recipe.Id, number, "", "");
            StepRules.Apply(step, new StepInput(item!.Description, item.Title, item.TimerMinutes, item.ImageUrl));
            recipe.Steps.Add(step);
        }
        return await store.CreateAsync(recipe, cancellationToken);
    }
}
