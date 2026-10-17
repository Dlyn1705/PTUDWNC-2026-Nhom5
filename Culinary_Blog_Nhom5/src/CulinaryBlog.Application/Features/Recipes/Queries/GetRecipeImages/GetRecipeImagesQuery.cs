using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeImages;

public sealed record GetRecipeImagesQuery(Guid RecipeId, Guid? ImageId = null) : IRequest<IReadOnlyList<RecipeImageDto>>;

public sealed class GetRecipeImagesQueryHandler(IRecipeRepository recipes, ICurrentUserService user)
    : IRequestHandler<GetRecipeImagesQuery, IReadOnlyList<RecipeImageDto>>
{
    public async Task<IReadOnlyList<RecipeImageDto>> Handle(GetRecipeImagesQuery request, CancellationToken ct)
    {
        var recipe = await recipes.GetDetailsByIdAsync(request.RecipeId, ct)
            ?? throw new NotFoundException("Recipe", request.RecipeId);
        RecipeImageAccess.EnsureOwner(recipe, user);
        var images = recipe.Images.Where(x => !x.IsDeleted && (!request.ImageId.HasValue || x.Id == request.ImageId))
            .OrderBy(x => x.OrderIndex).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id)
            .Select(RecipeImageAccess.ToDto).ToList();
        if (request.ImageId.HasValue && images.Count == 0)
            throw new NotFoundException("RecipeImage", request.ImageId.Value);
        return images;
    }
}

public static class RecipeImageAccess
{
    public static void EnsureOwner(Recipe recipe, ICurrentUserService user)
    {
        if (!user.IsAdmin && (string.IsNullOrEmpty(user.UserId) || recipe.AuthorId != user.UserId))
            throw new ForbiddenException("Chỉ chủ sở hữu công thức hoặc Admin mới được quản lý ảnh.");
    }

    public static RecipeImageDto ToDto(RecipeImage image) => new(image.Id, image.RecipeId,
        image.OriginalUrl, image.MediumUrl, image.ThumbnailUrl, image.AltText,
        image.IsPrimary, image.OrderIndex, image.ProcessingStatus);
}
