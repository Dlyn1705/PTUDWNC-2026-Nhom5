using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
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
    private readonly IPublicContentCache _cache;

    public GetCategoryBySlugQueryHandler(IUnitOfWork unitOfWork, IPublicContentCache cache)
    {
        _unitOfWork = unitOfWork;
        _cache = cache;
    }

    public async Task<CategoryDetailDto> Handle(
        GetCategoryBySlugQuery request,
        CancellationToken cancellationToken)
    {
        var page = Math.Max(request.Page, 1);
        var pageSize = Math.Clamp(request.PageSize, 1, 50);
        return await _cache.GetCategoryAsync(
            request.Slug,
            page,
            pageSize,
            ct => LoadAsync(request.Slug, page, pageSize, ct),
            cancellationToken);
    }

    private async Task<CategoryDetailDto> LoadAsync(
        string slug,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var category = await _unitOfWork.Categories.GetBySlugAsync(slug, cancellationToken);

        if (category is null)
        {
            throw new NotFoundException("Category", slug);
        }

        var (recipes, totalCount) = await _unitOfWork.Recipes.GetPagedAsync(
            page,
            pageSize,
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
            RecipeCount = totalCount,
            TotalRecipeCount = totalCount
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
                page,
                pageSize)
        };
    }
}
