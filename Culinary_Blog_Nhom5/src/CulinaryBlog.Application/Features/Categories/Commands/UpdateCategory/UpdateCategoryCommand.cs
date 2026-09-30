using System;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using FluentValidation;
using MediatR;

namespace CulinaryBlog.Application.Features.Categories.Commands.UpdateCategory;

public record UpdateCategoryCommand(
    Guid Id,
    string Name,
    string? Description = null,
    string? ImageUrl = null,
    int OrderIndex = 0
) : IRequest<CategoryDto>;

public class UpdateCategoryCommandValidator : AbstractValidator<UpdateCategoryCommand>
{
    public UpdateCategoryCommandValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty().WithMessage("Category Id không được để trống.");

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Tên danh mục không được để trống.")
            .Length(2, 100).WithMessage("Tên danh mục phải từ 2 đến 100 ký tự.");
    }
}

public class UpdateCategoryCommandHandler : IRequestHandler<UpdateCategoryCommand, CategoryDto>
{
    private readonly IUnitOfWork _unitOfWork;

    public UpdateCategoryCommandHandler(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<CategoryDto> Handle(UpdateCategoryCommand request, CancellationToken cancellationToken)
    {
        var category = await _unitOfWork.Categories.GetByIdAsync(request.Id, cancellationToken);
        if (category == null)
        {
            throw new NotFoundException("Category", request.Id);
        }

        // Check if name changed and if another category already has this name
        if (!string.Equals(category.Name, request.Name, StringComparison.OrdinalIgnoreCase))
        {
            if (await _unitOfWork.Categories.ExistsByNameAsync(request.Name, cancellationToken))
            {
                throw new ConflictException($"Danh mục với tên '{request.Name}' đã tồn tại.");
            }
        }

        // Keep slug unchanged to protect SEO backlinks as mandated by FR-CAT-004
        category.Update(request.Name, request.Description, request.ImageUrl, request.OrderIndex);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        int recipeCount = await _unitOfWork.Recipes.CountByCategoryIdAsync(category.Id, cancellationToken);

        return new CategoryDto
        {
            Id = category.Id,
            Name = category.Name,
            Slug = category.Slug,
            Description = category.Description,
            ImageUrl = category.ImageUrl,
            OrderIndex = category.OrderIndex,
            RecipeCount = recipeCount
        };
    }
}
