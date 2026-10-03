using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Queries.GetPublicRecipes;

public record GetPublicRecipesQuery(
    int Page = 1,
    int PageSize = 12,
    Guid? CategoryId = null,
    RecipeDifficulty? Difficulty = null,
    int? MaxCookTime = null,
    string? SortBy = null,
    string? SortOrder = null
) : IRequest<PagedResult<RecipeSummaryDto>>;

public class GetPublicRecipesQueryHandler : IRequestHandler<GetPublicRecipesQuery, PagedResult<RecipeSummaryDto>>
{
    private readonly IUnitOfWork _unitOfWork;

    public GetPublicRecipesQueryHandler(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<PagedResult<RecipeSummaryDto>> Handle(GetPublicRecipesQuery request, CancellationToken cancellationToken)
    {
        int page = Math.Max(request.Page, 1);
        int pageSize = Math.Clamp(request.PageSize, 1, 50);

        string sortParam = request.SortBy ?? "createdAt";
        if (!string.IsNullOrWhiteSpace(request.SortOrder) && request.SortOrder.Equals("asc", StringComparison.OrdinalIgnoreCase))
        {
            if (sortParam.StartsWith("-")) sortParam = sortParam.Substring(1);
        }
        else if (!string.IsNullOrWhiteSpace(request.SortOrder) && request.SortOrder.Equals("desc", StringComparison.OrdinalIgnoreCase))
        {
            if (!sortParam.StartsWith("-")) sortParam = $"-{sortParam}";
        }

        var (items, totalCount) = await _unitOfWork.Recipes.GetPagedAsync(
            page,
            pageSize,
            categoryId: request.CategoryId,
            difficulty: request.Difficulty,
            maxCookTime: request.MaxCookTime,
            sortBy: sortParam,
            includeDrafts: false,
            ct: cancellationToken);

        var dtos = items.Select(r => new RecipeSummaryDto
        {
            Id = r.Id,
            Title = r.Title,
            Slug = r.Slug,
            CreatedAt = r.CreatedAt,
            Description = r.Description,
            PrepTimeMinutes = r.PrepTime,
            CookTimeMinutes = r.CookTime,
            Servings = r.Servings,
            Difficulty = (int)r.Difficulty,
            Status = (int)r.Status,
            CategoryId = r.CategoryId,
            CategoryName = r.Category?.Name ?? string.Empty,
            CategorySlug = r.Category?.Slug ?? string.Empty,
            Author = new RecipeAuthorSummaryDto
            {
                Id = r.Author?.Id ?? string.Empty,
                DisplayName = r.Author?.DisplayName ?? "Author",
                AvatarUrl = r.Author?.AvatarUrl
            },
            Images = r.Images
                .OrderByDescending(img => img.IsPrimary)
                .ThenBy(img => img.OrderIndex)
                .Select(img => new RecipeImageSummaryDto
                {
                    Id = img.Id,
                    Url = img.OriginalUrl,
                    IsPrimary = img.IsPrimary,
                    Alt = img.AltText
                })
                .ToList()
        }).ToList();

        return new PagedResult<RecipeSummaryDto>(dtos, totalCount, page, pageSize);
    }
}
