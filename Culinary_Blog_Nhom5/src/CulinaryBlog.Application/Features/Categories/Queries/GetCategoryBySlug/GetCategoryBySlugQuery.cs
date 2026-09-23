using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Categories.Queries.GetCategoryBySlug;

public sealed record GetCategoryBySlugQuery(
    string Slug,
    int Page,
    int PageSize) : IRequest<CategoryDetailDto>;

public sealed class GetCategoryBySlugQueryHandler
    : IRequestHandler<GetCategoryBySlugQuery, CategoryDetailDto>
{
    private readonly IUnitOfWork _unitOfWork;

    public GetCategoryBySlugQueryHandler(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<CategoryDetailDto> Handle(
        GetCategoryBySlugQuery request,
        CancellationToken cancellationToken)
    {
        var category = await _unitOfWork.Categories.GetBySlugAsync(
            request.Slug,
            cancellationToken);

        if (category is null)
        {
            throw new NotFoundException("Category", request.Slug);
        }

        var (recipes, totalCount) = await _unitOfWork.Recipes.GetPagedAsync(
            request.Page,
            request.PageSize,
            categoryId: category.Id,
            ct: cancellationToken);

        var categoryDto = new CategoryDto
        {
            Id = category.Id,
            Name = category.Name,
            Slug = category.Slug,
            Description = category.Description,
            ImageUrl = category.ImageUrl,
            OrderIndex = category.OrderIndex,
            RecipeCount = totalCount
        };

        var recipeDtos = recipes.Select(recipe => new RecipeSummaryDto
        {
            Id = recipe.Id,
            Title = recipe.Title,
            Slug = recipe.Slug,
            CreatedAt = recipe.CreatedAt,
            Description = recipe.Description,
            PrepTimeMinutes = recipe.PrepTime,
            CookTimeMinutes = recipe.CookTime,
            Servings = recipe.Servings,
            Difficulty = (int)recipe.Difficulty,
            Status = (int)recipe.Status,
            CategoryId = recipe.CategoryId,
            CategoryName = recipe.Category.Name,
            CategorySlug = recipe.Category.Slug,
            Author = new RecipeAuthorSummaryDto
            {
                Id = recipe.Author.Id,
                DisplayName = recipe.Author.DisplayName,
                AvatarUrl = recipe.Author.AvatarUrl
            },
            Images = recipe.Images
                .OrderByDescending(image => image.IsPrimary)
                .ThenBy(image => image.OrderIndex)
                .Select(image => new RecipeImageSummaryDto
                {
                    Id = image.Id,
                    Url = image.ThumbnailUrl ?? image.MediumUrl ?? image.OriginalUrl,
                    IsPrimary = image.IsPrimary,
                    Alt = image.AltText
                })
                .ToList()
        }).ToList();

        return new CategoryDetailDto
        {
            Category = categoryDto,
            Recipes = new PagedResult<RecipeSummaryDto>(
                recipeDtos,
                totalCount,
                request.Page,
                request.PageSize)
        };
    }
}
