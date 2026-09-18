using System;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Common.Helpers;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using FluentValidation;
using MediatR;

namespace CulinaryBlog.Application.Features.Categories.Commands.CreateCategory;

public record CreateCategoryCommand(
    string Name,
    string? Description = null,
    string? ImageUrl = null,
    int OrderIndex = 0
) : IRequest<CategoryDto>;

public class CreateCategoryCommandValidator : AbstractValidator<CreateCategoryCommand>
{
    public CreateCategoryCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Tên danh mục không được để trống.")
            .Length(2, 50).WithMessage("Tên danh mục phải từ 2 đến 50 ký tự.");
    }
}

public class CreateCategoryCommandHandler : IRequestHandler<CreateCategoryCommand, CategoryDto>
{
    private readonly IUnitOfWork _unitOfWork;

    public CreateCategoryCommandHandler(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<CategoryDto> Handle(CreateCategoryCommand request, CancellationToken cancellationToken)
    {
        if (await _unitOfWork.Categories.ExistsByNameAsync(request.Name, cancellationToken))
        {
            throw new ConflictException($"Danh mục với tên '{request.Name}' đã tồn tại.");
        }

        string baseSlug = SlugHelper.Generate(request.Name);
        string slug = baseSlug;
        int counter = 1;

        while (await _unitOfWork.Categories.ExistsBySlugAsync(slug, cancellationToken))
        {
            counter++;
            slug = $"{baseSlug}-{counter}";
        }

        var category = Category.Create(request.Name, slug, request.Description, request.ImageUrl, request.OrderIndex);
        await _unitOfWork.Categories.AddAsync(category, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new CategoryDto
        {
            Id = category.Id,
            Name = category.Name,
            Slug = category.Slug,
            Description = category.Description,
            ImageUrl = category.ImageUrl,
            OrderIndex = category.OrderIndex,
            RecipeCount = 0
        };
    }
}
