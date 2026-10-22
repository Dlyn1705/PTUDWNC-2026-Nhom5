using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using FluentValidation;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipe;

public sealed record UpdateRecipeCommand(Guid Id, string Title, string? Description, string? Instructions,
    int PrepTime, int CookTime, int Servings, RecipeDifficulty Difficulty, Guid CategoryId,
    string? RowVersion = null, string? IfMatch = null) : IRequest<UpdatedRecipe>;

public sealed record UpdatedRecipe(string Message, Guid Id, string Slug, string RowVersion);

public interface IRecipeUpdateStore
{
    Task<Recipe?> GetAsync(Guid id, CancellationToken cancellationToken);
    Task<UpdatedRecipe> SaveAsync(Recipe recipe, byte[] expectedVersion, string actorId, CancellationToken cancellationToken);
    Task<UpdatedRecipe> SaveNutritionAsync(Recipe recipe, byte[] expectedVersion, string actorId, CancellationToken cancellationToken);
}

public sealed class UpdateRecipeCommandValidator : AbstractValidator<UpdateRecipeCommand>
{
    public UpdateRecipeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Title).Cascade(CascadeMode.Stop).NotEmpty()
            .Must(x => x.Trim().Length is >= 3 and <= 200)
            .WithMessage("Tên công thức phải từ 3 đến 200 ký tự.");
        RuleFor(x => x.Description).Must(x => (x?.Trim().Length ?? 0) <= 2000)
            .WithMessage("Mô tả tối đa 2000 ký tự.");
        RuleFor(x => x.Instructions).Must(x => (x?.Trim().Length ?? 0) <= 10000)
            .WithMessage("Hướng dẫn tối đa 10000 ký tự.");
        RuleFor(x => x.CategoryId).NotEmpty().WithMessage("Vui lòng chọn danh mục.");
        RuleFor(x => x.Difficulty).IsInEnum().WithMessage("Độ khó không hợp lệ.");
        RuleFor(x => x.PrepTime).GreaterThanOrEqualTo(0);
        RuleFor(x => x.CookTime).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Servings).GreaterThan(0);
    }
}

public sealed class UpdateRecipeCommandHandler(ICurrentUserService user, IRecipeUpdateStore store)
    : IRequestHandler<UpdateRecipeCommand, UpdatedRecipe>
{
    public async Task<UpdatedRecipe> Handle(UpdateRecipeCommand request, CancellationToken cancellationToken)
    {
        if (!user.IsAuthenticated || string.IsNullOrWhiteSpace(user.UserId))
            throw new UnauthorizedAccessException("Vui lòng đăng nhập.");
        if (!user.IsAdmin && !user.Roles.Contains("Author")) throw new ForbiddenException();
        var recipe = await store.GetAsync(request.Id, cancellationToken);
        if (recipe is null || recipe.IsDeleted) throw new NotFoundException("Recipe", request.Id);
        if (!user.IsAdmin && recipe.AuthorId != user.UserId)
            throw new ForbiddenException("Bạn chỉ được cập nhật công thức do chính mình tạo.");

        var expectedVersion = RecipeUpdateVersion.Parse(request.RowVersion, request.IfMatch);
        recipe.Update(request.Title.Trim(), request.Description?.Trim() ?? "", request.Instructions?.Trim(),
            request.PrepTime, request.CookTime, request.Servings, request.Difficulty, request.CategoryId);
        return await store.SaveAsync(recipe, expectedVersion, user.UserId, cancellationToken);
    }
}
