using System;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Common.Helpers;
using CulinaryBlog.Application.Contracts;
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
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Tên danh mục không được để trống.")
            .Must(name => name.Trim().Length is >= 2 and <= 100)
            .WithMessage("Tên danh mục phải từ 2 đến 100 ký tự sau khi loại bỏ khoảng trắng thừa.")
            .Must(name => !string.IsNullOrEmpty(SlugHelper.Generate(name)))
            .WithMessage("Tên danh mục phải chứa ít nhất một chữ cái hoặc chữ số.");

        RuleFor(x => x.ImageUrl)
            .MaximumLength(500).WithMessage("URL ảnh không được vượt quá 500 ký tự.")
            .Must(BeValidHttpUrl)
            .WithMessage("URL ảnh phải là địa chỉ HTTP hoặc HTTPS hợp lệ.");

        RuleFor(x => x.OrderIndex)
            .GreaterThanOrEqualTo(0)
            .WithMessage("Thứ tự hiển thị phải lớn hơn hoặc bằng 0.");
    }

    private static bool BeValidHttpUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        return Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }
}

public class UpdateCategoryCommandHandler : IRequestHandler<UpdateCategoryCommand, CategoryDto>
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly ICurrentUserService _currentUser;

    public UpdateCategoryCommandHandler(
        IUnitOfWork unitOfWork,
        ICurrentUserService currentUser)
    {
        _unitOfWork = unitOfWork;
        _currentUser = currentUser;
    }

    public async Task<CategoryDto> Handle(UpdateCategoryCommand request, CancellationToken cancellationToken)
    {
        if (!_currentUser.IsAdmin)
        {
            throw new ForbiddenException();
        }

        var category = await _unitOfWork.Categories.GetByIdAsync(request.Id, cancellationToken);
        if (category == null)
        {
            throw new NotFoundException("Category", request.Id);
        }

        var name = request.Name.Trim();
        var description = string.IsNullOrWhiteSpace(request.Description)
            ? null
            : request.Description.Trim();
        var imageUrl = string.IsNullOrWhiteSpace(request.ImageUrl)
            ? null
            : request.ImageUrl.Trim();

        // Check if name changed and if another category already has this name
        if (!string.Equals(category.Name, name, StringComparison.OrdinalIgnoreCase))
        {
            if (await _unitOfWork.Categories.ExistsByNameAsync(name, cancellationToken))
            {
                throw new ConflictException(
                    $"Danh mục với tên '{name}' đã tồn tại.",
                    "CATEGORY_NAME_ALREADY_EXISTS");
            }
        }

        // Keep slug unchanged to protect SEO backlinks as mandated by FR-CAT-004
        category.Update(name, description, imageUrl, request.OrderIndex);
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
            RecipeCount = recipeCount,
            TotalRecipeCount = recipeCount
        };
    }
}
