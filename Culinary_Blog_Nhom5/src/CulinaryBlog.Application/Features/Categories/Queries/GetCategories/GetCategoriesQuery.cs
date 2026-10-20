using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Categories.Queries.GetCategories;

public record GetCategoriesQuery : IRequest<IReadOnlyList<CategoryDto>>;

public class GetCategoriesQueryHandler : IRequestHandler<GetCategoriesQuery, IReadOnlyList<CategoryDto>>
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly ICurrentUserService _currentUser;
    private readonly IPublicContentCache _cache;

    public GetCategoriesQueryHandler(
        IUnitOfWork unitOfWork,
        ICurrentUserService currentUser,
        IPublicContentCache cache)
    {
        _unitOfWork = unitOfWork;
        _currentUser = currentUser;
        _cache = cache;
    }

    public async Task<IReadOnlyList<CategoryDto>> Handle(GetCategoriesQuery request, CancellationToken cancellationToken)
    {
        // Admin-only counts must never enter the shared public cache.
        if (_currentUser.IsAdmin)
        {
            return await LoadAsync(cancellationToken, includeTotalRecipeCount: true);
        }

        return await _cache.GetCategoriesAsync(
            ct => LoadAsync(ct, includeTotalRecipeCount: false),
            cancellationToken);
    }

    private async Task<IReadOnlyList<CategoryDto>> LoadAsync(
        CancellationToken cancellationToken,
        bool includeTotalRecipeCount)
    {
        var results = await _unitOfWork.Categories.GetAllWithRecipeCountAsync(cancellationToken);

        return results.Select(item => new CategoryDto
        {
            Id = item.Category.Id,
            Name = item.Category.Name,
            Slug = item.Category.Slug,
            Description = item.Category.Description,
            ImageUrl = item.Category.ImageUrl,
            OrderIndex = item.Category.OrderIndex,
            RecipeCount = item.RecipeCount,
            TotalRecipeCount = includeTotalRecipeCount
                ? item.TotalRecipeCount
                : item.RecipeCount
        }).OrderBy(x => x.OrderIndex).ThenBy(x => x.Name).ToList();
    }
}
