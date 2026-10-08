using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeBySlug;

public sealed record GetRecipeBySlugQuery(string Slug) : IRequest<RecipeDetailDto>;

public sealed class GetRecipeBySlugQueryHandler
    : IRequestHandler<GetRecipeBySlugQuery, RecipeDetailDto>
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly ICurrentUserService _currentUser;

    public GetRecipeBySlugQueryHandler(
        IUnitOfWork unitOfWork,
        ICurrentUserService currentUser)
    {
        _unitOfWork = unitOfWork;
        _currentUser = currentUser;
    }

    public async Task<RecipeDetailDto> Handle(
        GetRecipeBySlugQuery request,
        CancellationToken cancellationToken)
    {
        var recipe = await _unitOfWork.Recipes.GetBySlugAsync(
            request.Slug,
            cancellationToken);

        if (recipe is null || recipe.IsDeleted)
        {
            throw new NotFoundException("Recipe", request.Slug);
        }

        var canViewUnpublished = _currentUser.IsAdmin
            || string.Equals(recipe.AuthorId, _currentUser.UserId, StringComparison.Ordinal);

        if (recipe.Status != RecipeStatus.Published && !canViewUnpublished)
        {
            throw new NotFoundException("Recipe", request.Slug);
        }

        return new RecipeDetailDto
        {
            Id = recipe.Id,
            RowVersion = Convert.ToBase64String(recipe.RowVersion),
            Title = recipe.Title,
            Slug = recipe.Slug,
            CreatedAt = recipe.CreatedAt,
            Description = recipe.Description,
            Instructions = recipe.Instructions,
            PrepTimeMinutes = recipe.PrepTime,
            CookTimeMinutes = recipe.CookTime,
            Servings = recipe.Servings,
            Difficulty = (int)recipe.Difficulty,
            Status = (int)recipe.Status,
            CategoryId = recipe.CategoryId,
            CategoryName = recipe.Category.Name,
            CategorySlug = recipe.Category.Slug,
            Author = new RecipeDetailAuthorDto
            {
                Id = recipe.Author.Id,
                DisplayName = recipe.Author.DisplayName,
                AvatarUrl = recipe.Author.AvatarUrl,
                Bio = recipe.Author.Bio
            },
            Nutrition = new RecipeDetailNutritionDto
            {
                Calories = recipe.Nutrition.Calories ?? 0,
                Protein = recipe.Nutrition.Protein ?? 0,
                Carbs = recipe.Nutrition.Carbohydrates ?? 0,
                Fat = recipe.Nutrition.Fat ?? 0,
                Fiber = recipe.Nutrition.Fiber ?? 0,
                Sodium = recipe.Nutrition.Sodium ?? 0
            },
            Images = recipe.Images
                .OrderByDescending(image => image.IsPrimary)
                .ThenBy(image => image.OrderIndex)
                .Select(image => new RecipeDetailImageDto
                {
                    Id = image.Id,
                    Url = image.OriginalUrl,
                    IsPrimary = image.IsPrimary,
                    Alt = image.AltText
                })
                .ToList(),
            Ingredients = recipe.Ingredients
                .OrderBy(ingredient => ingredient.OrderIndex)
                .Select(ingredient => new RecipeDetailIngredientDto
                {
                    Id = ingredient.Id,
                    Name = ingredient.Name,
                    Quantity = ingredient.Quantity ?? 0,
                    Unit = ingredient.Unit ?? string.Empty,
                    Notes = ingredient.Notes
                })
                .ToList(),
            Steps = recipe.Steps
                .OrderBy(step => step.StepNumber)
                .Select(step => new RecipeDetailStepDto
                {
                    Id = step.Id,
                    Order = step.StepNumber,
                    Title = step.Title,
                    Text = step.Description,
                    ImageUrl = step.ImageUrl,
                    TimerMinutes = step.TimerMinutes
                })
                .ToList()
        };
    }
}
