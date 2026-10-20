using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;

namespace CulinaryBlog.Application.Contracts;

public interface IPublicContentCache
{
    Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(
        Func<CancellationToken, Task<IReadOnlyList<CategoryDto>>> factory,
        CancellationToken cancellationToken = default);

    Task<CategoryDetailDto> GetCategoryAsync(
        string slug,
        int page,
        int pageSize,
        Func<CancellationToken, Task<CategoryDetailDto>> factory,
        CancellationToken cancellationToken = default);

    Task<PagedResult<RecipeSummaryDto>> GetRecipesAsync(
        string queryKey,
        Func<CancellationToken, Task<PagedResult<RecipeSummaryDto>>> factory,
        CancellationToken cancellationToken = default);

    Task<RecipeDetailDto> GetRecipeAsync(
        string slug,
        Func<CancellationToken, Task<RecipeDetailDto>> factory,
        CancellationToken cancellationToken = default);

    Task InvalidateCategoriesAsync(
        string? slug = null,
        CancellationToken cancellationToken = default);

    Task InvalidateRecipesAsync(
        Guid? recipeId = null,
        string? slug = null,
        CancellationToken cancellationToken = default);
}
