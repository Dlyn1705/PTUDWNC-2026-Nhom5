using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Interfaces;
using FluentValidation;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Queries.SearchRecipes;

public record SearchRecipesQuery(
    string Q,
    int Page = 1,
    int PageSize = 12,
    Guid? CategoryId = null,
    RecipeDifficulty? Difficulty = null,
    string? SortBy = null) : IRequest<ApiResponse<PagedResult<RecipeSummaryDto>>>;

public class SearchRecipesQueryValidator : AbstractValidator<SearchRecipesQuery>
{
    public SearchRecipesQueryValidator()
    {
        RuleFor(x => x.Q)
            .NotEmpty().WithMessage("Từ khóa tìm kiếm không được để trống.")
            .Must(q => !string.IsNullOrWhiteSpace(q)).WithMessage("Từ khóa tìm kiếm không được để trống.")
            .Must(q => q.Trim().Length >= 2).WithMessage("Từ khóa tìm kiếm phải có ít nhất 2 ký tự.")
            .MaximumLength(100).WithMessage("Từ khóa tìm kiếm tối đa 100 ký tự.");

        RuleFor(x => x.Page)
            .GreaterThanOrEqualTo(1).WithMessage("Page phải lớn hơn hoặc bằng 1.");

        RuleFor(x => x.PageSize)
            .InclusiveBetween(1, 50).WithMessage("PageSize phải nằm trong khoảng từ 1 đến 50.");
    }
}

public class SearchRecipesQueryHandler : IRequestHandler<SearchRecipesQuery, ApiResponse<PagedResult<RecipeSummaryDto>>>
{
    private readonly IUnitOfWork _unitOfWork;

    public SearchRecipesQueryHandler(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<ApiResponse<PagedResult<RecipeSummaryDto>>> Handle(SearchRecipesQuery request, CancellationToken cancellationToken)
    {
        var keyword = request.Q.Trim();
        var normalized = NormalizeKeyword(keyword);
        var tsQuery = BuildTsQuery(normalized);

        var (items, totalCount) = await _unitOfWork.Recipes.SearchRecipesAsync(
            tsQuery,
            request.Page,
            request.PageSize,
            request.CategoryId,
            request.Difficulty,
            request.SortBy,
            cancellationToken);

        var mapped = items.Select(r => new RecipeSummaryDto
        {
            Id = r.Id,
            Title = r.Title,
            Slug = r.Slug,
            Description = r.Description,
            PrimaryImageUrl = r.Images.FirstOrDefault(img => img.IsPrimary)?.OriginalUrl
                ?? r.Images.FirstOrDefault()?.OriginalUrl,
            Category = new RecipeCategorySummaryDto
            {
                Id = r.Category.Id,
                Name = r.Category.Name,
                Slug = r.Category.Slug
            },
            Author = new RecipeAuthorSummaryDto
            {
                Id = r.AuthorId,
                DisplayName = r.Author.DisplayName,
                AvatarUrl = r.Author.AvatarUrl
            },
            Difficulty = r.Difficulty.ToString(),
            PrepTime = r.PrepTime,
            CookTime = r.CookTime,
            Servings = r.Servings,
            RelevanceScore = 0,
            CreatedAt = r.CreatedAt
        }).ToList();

        var paged = new PagedResult<RecipeSummaryDto>(mapped, totalCount, request.Page, request.PageSize);
        return ApiResponse<PagedResult<RecipeSummaryDto>>.Ok(paged, $"Tìm thấy {totalCount} kết quả cho '{keyword}'.");
    }

    private static string NormalizeKeyword(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return string.Empty;
        }

        var normalized = input.Trim();
        normalized = normalized.Normalize(System.Text.NormalizationForm.FormD);

        var builder = new StringBuilder();
        foreach (var ch in normalized)
        {
            var unicodeCategory = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch);
            if (unicodeCategory != System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                builder.Append(char.ToLowerInvariant(ch));
            }
        }

        normalized = builder.ToString();
        normalized = Regex.Replace(normalized, @"[^a-z0-9\s-]", " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
        return normalized;
    }

    private static string BuildTsQuery(string normalized)
    {
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "''";
        }

        var tokens = Regex.Split(normalized, @"\s+")
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Select(token => token.Trim())
            .Where(token => token.Length > 0)
            .Select(token => token.Replace("'", "''"))
            .Select(token => $"'{token}':*")
            .ToList();

        return tokens.Count > 0 ? string.Join(" & ", tokens) : "''";
    }
}
