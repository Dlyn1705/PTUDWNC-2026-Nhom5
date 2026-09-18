using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Categories.Queries.GetCategories;

public record GetCategoriesQuery : IRequest<IReadOnlyList<CategoryDto>>;

public class GetCategoriesQueryHandler : IRequestHandler<GetCategoriesQuery, IReadOnlyList<CategoryDto>>
{
    private readonly IUnitOfWork _unitOfWork;

    public GetCategoriesQueryHandler(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<CategoryDto>> Handle(GetCategoriesQuery request, CancellationToken cancellationToken)
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
            RecipeCount = item.RecipeCount
        }).OrderBy(x => x.OrderIndex).ThenBy(x => x.Name).ToList();
    }
}
