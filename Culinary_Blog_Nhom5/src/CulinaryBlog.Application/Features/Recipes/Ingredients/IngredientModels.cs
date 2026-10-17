using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using FluentValidation;

namespace CulinaryBlog.Application.Features.Recipes.Ingredients;

public sealed record IngredientInput(string? Name, decimal? Quantity = null, string? Unit = null, string? Notes = null);
public sealed record IngredientDto(Guid Id, Guid RecipeId, string Name, decimal? Quantity,
    string? Unit, string? Notes, int OrderIndex);
public sealed record IngredientSnapshot(IReadOnlyList<IngredientDto> Ingredients, string RowVersion);
public enum IngredientOperation { Add, Update, Delete, Reorder }
public sealed record IngredientMutation(Guid RecipeId, IngredientOperation Operation, byte[] ExpectedVersion,
    Guid? IngredientId = null, IngredientInput? Input = null, IReadOnlyList<Guid>? IngredientIds = null);

public sealed class IngredientInputValidator : AbstractValidator<IngredientInput>
{
    public IngredientInputValidator()
    {
        RuleFor(x => x.Name).Must(name => !string.IsNullOrWhiteSpace(name) && name.Trim().Length <= 200)
            .WithMessage("Tên nguyên liệu bắt buộc, tối đa 200 ký tự.");
        RuleFor(x => x.Quantity).Must(q => q is null || (q > 0 && q <= 9999999.999m && decimal.Round(q.Value, 3) == q))
            .WithMessage("Số lượng phải lớn hơn 0, tối đa 9999999.999 và có tối đa 3 chữ số thập phân.");
        RuleFor(x => x.Unit).Must(value => value?.Trim().Length is null or <= 50)
            .WithMessage("Đơn vị tối đa 50 ký tự.");
        RuleFor(x => x.Notes).Must(value => value?.Trim().Length is null or <= 500)
            .WithMessage("Ghi chú tối đa 500 ký tự.");
    }
}

public static class IngredientRules
{
    public const int MaximumCount = 100;
    public static void Validate(IngredientInput input, string prefix = "")
    {
        var errors = new IngredientInputValidator().Validate(input).Errors;
        if (errors.Count > 0)
            throw new CulinaryBlog.Domain.Exceptions.ValidationException(errors.GroupBy(x => prefix + x.PropertyName)
                .ToDictionary(group => group.Key, group => group.Select(x => x.ErrorMessage).ToArray()));
    }

    public static void EnsureOwner(Recipe recipe, ICurrentUserService user)
    {
        if (!user.IsAdmin && (string.IsNullOrEmpty(user.UserId) || recipe.AuthorId != user.UserId))
            throw new ForbiddenException("Chỉ chủ sở hữu công thức hoặc Admin mới được quản lý nguyên liệu.");
    }

    public static IngredientDto ToDto(RecipeIngredient item) => new(item.Id, item.RecipeId,
        item.Name, item.Quantity, item.Unit, item.Notes, item.OrderIndex);
}
