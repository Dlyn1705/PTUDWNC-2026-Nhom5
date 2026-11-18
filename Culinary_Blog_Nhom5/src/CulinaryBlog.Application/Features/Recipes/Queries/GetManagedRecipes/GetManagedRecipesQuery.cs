using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Queries.GetManagedRecipes;

public sealed record ManagedRecipeCategoryDto(Guid Id, string Name);
public sealed record ManagedRecipeAuthorDto(string Id, string DisplayName);
public sealed record ManagedRecipeSummaryDto(
    Guid Id,
    string Title,
    string Slug,
    string? Description,
    RecipeStatus Status,
    DateTime? UpdatedAt,
    ManagedRecipeCategoryDto? Category,
    ManagedRecipeAuthorDto? Author,
    string? PrimaryImageUrl);

public sealed record GetManagedRecipesQuery(
    int Page = 1,
    int PageSize = 12,
    RecipeStatus? Status = null,
    string? SortBy = null) : IRequest<PagedResult<ManagedRecipeSummaryDto>>;

public sealed class GetManagedRecipesQueryHandler(
    IRecipeRepository recipes,
    ICurrentUserService currentUser)
    : IRequestHandler<GetManagedRecipesQuery, PagedResult<ManagedRecipeSummaryDto>>
{
    public async Task<PagedResult<ManagedRecipeSummaryDto>> Handle(
        GetManagedRecipesQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || string.IsNullOrWhiteSpace(currentUser.UserId))
            throw new UnauthorizedAccessException("Authentication required.");
        if (!currentUser.IsAdmin
            && !currentUser.Roles.Contains("Author", StringComparer.Ordinal))
            throw new ForbiddenException("Author or administrator role required.");

        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 50);
        var (items, totalCount) = await recipes.GetPagedAsync(
            page,
            pageSize,
            sortBy: request.SortBy,
            authorId: currentUser.IsAdmin ? null : currentUser.UserId,
            includeDrafts: true,
            status: request.Status,
            ct: cancellationToken);

        var data = items.Select(recipe => new ManagedRecipeSummaryDto(
            recipe.Id,
            recipe.Title,
            recipe.Slug,
            recipe.Description,
            recipe.Status,
            recipe.UpdatedAt,
            recipe.Category is null
                ? null
                : new ManagedRecipeCategoryDto(recipe.Category.Id, recipe.Category.Name),
            recipe.Author is null
                ? null
                : new ManagedRecipeAuthorDto(recipe.Author.Id, recipe.Author.DisplayName),
            recipe.Images
                .Where(image => image.IsPrimary && !image.IsDeleted)
                .Select(image => image.ThumbnailUrl ?? image.MediumUrl ?? image.OriginalUrl)
                .FirstOrDefault())).ToArray();

        return new PagedResult<ManagedRecipeSummaryDto>(data, totalCount, page, pageSize);
    }
}
