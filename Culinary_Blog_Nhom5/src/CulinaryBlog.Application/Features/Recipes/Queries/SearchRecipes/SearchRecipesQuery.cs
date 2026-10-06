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
    int? MinCookTime = null,
    int? MaxCookTime = null,
    int? MinServings = null,
    int? MaxServings = null,
    string? SortBy = null,
    string? SortOrder = null,
    string? Sort = null) : IRequest<ApiResponse<PagedResult<SearchRecipeSummaryDto>>>;


public class SearchRecipesQueryValidator : AbstractValidator<SearchRecipesQuery>
{
    public SearchRecipesQueryValidator()
    {
        RuleFor(x => x.Q)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Từ khóa tìm kiếm không được để trống.")
            .Must(q => !string.IsNullOrWhiteSpace(q)).WithMessage("Từ khóa tìm kiếm không được để trống.")
            .Must(q => q.Trim().Length >= 2).WithMessage("Từ khóa tìm kiếm phải có ít nhất 2 ký tự.")
            .MaximumLength(100).WithMessage("Từ khóa tìm kiếm tối đa 100 ký tự.");

        RuleFor(x => x.Page)
            .GreaterThanOrEqualTo(1).WithMessage("Page phải lớn hơn hoặc bằng 1.")
            .Must((query, page) => page >= 1 && (long)(page - 1) * Math.Clamp(query.PageSize, 1, 50) <= int.MaxValue)
            .WithMessage("Page vượt quá phạm vi phân trang hỗ trợ.");

        RuleFor(x => x.PageSize)
            .InclusiveBetween(1, 50).WithMessage("PageSize phải nằm trong khoảng từ 1 đến 50.");

        RuleFor(x => x.CategoryId)
            .Must(id => !id.HasValue || id.Value != Guid.Empty)
            .WithMessage("CategoryId không hợp lệ.");

        RuleFor(x => x.Difficulty)
            .Must(value => !value.HasValue || Enum.IsDefined(typeof(RecipeDifficulty), value.Value))
            .WithMessage("Difficulty không được hỗ trợ.");

        RuleFor(x => x.MinCookTime).GreaterThanOrEqualTo(0).When(x => x.MinCookTime.HasValue);
        RuleFor(x => x.MaxCookTime).GreaterThanOrEqualTo(0).When(x => x.MaxCookTime.HasValue);
        RuleFor(x => x.MinServings).GreaterThan(0).When(x => x.MinServings.HasValue);
        RuleFor(x => x.MaxServings).GreaterThan(0).When(x => x.MaxServings.HasValue);
        RuleFor(x => x.MaxCookTime)
            .GreaterThanOrEqualTo(x => x.MinCookTime!.Value)
            .When(x => x.MinCookTime.HasValue && x.MaxCookTime.HasValue)
            .WithMessage("MaxCookTime phải lớn hơn hoặc bằng MinCookTime.");
        RuleFor(x => x.MaxServings)
            .GreaterThanOrEqualTo(x => x.MinServings!.Value)
            .When(x => x.MinServings.HasValue && x.MaxServings.HasValue)
            .WithMessage("MaxServings phải lớn hơn hoặc bằng MinServings.");

        RuleFor(x => x.SortBy)
            .Must(value => string.IsNullOrWhiteSpace(value) || new[] { "relevance", "createdat", "title", "cooktime" }.Contains(value.Trim(), StringComparer.OrdinalIgnoreCase))
            .WithMessage("SortBy không được hỗ trợ.");
        RuleFor(x => x.SortOrder)
            .Must(value => string.IsNullOrWhiteSpace(value) || new[] { "asc", "desc" }.Contains(value.Trim(), StringComparer.OrdinalIgnoreCase))
            .WithMessage("SortOrder phải là asc hoặc desc.");
        RuleFor(x => x.Sort)
            .Must((query, value) => !string.IsNullOrWhiteSpace(query.SortBy) || !string.IsNullOrWhiteSpace(query.SortOrder) || string.IsNullOrWhiteSpace(value) || new[]
            {
                "relevance", "createdat", "-createdat", "cooktime", "-cooktime", "title", "-title"
            }.Contains(value.Trim(), StringComparer.OrdinalIgnoreCase))
            .WithMessage("Sort không được hỗ trợ.");
    }
}

public class SearchRecipesQueryHandler : IRequestHandler<SearchRecipesQuery, ApiResponse<PagedResult<SearchRecipeSummaryDto>>>
{
    private readonly IUnitOfWork _unitOfWork;

    public SearchRecipesQueryHandler(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<ApiResponse<PagedResult<SearchRecipeSummaryDto>>> Handle(SearchRecipesQuery request, CancellationToken cancellationToken)
    {
        var keyword = request.Q.Trim();
        var normalized = NormalizeKeyword(keyword);
        var tsQuery = BuildTsQuery(normalized);

        var (sortBy, sortOrder) = ResolveSort(request);

        var (items, totalCount, scores) = await _unitOfWork.Recipes.SearchRecipesAsync(
            tsQuery,
            request.Page,
            request.PageSize,
            request.CategoryId,
            request.Difficulty,
            request.MinCookTime,
            request.MaxCookTime,
            request.MinServings,
            request.MaxServings,
            sortBy,
            sortOrder,
            cancellationToken);

        var mapped = items.Select(r => new SearchRecipeSummaryDto
        {
            Id = r.Id,
            Title = r.Title,
            Slug = r.Slug,
            Description = r.Description,
            PrimaryImageUrl = r.Images.FirstOrDefault(img => img.IsPrimary)?.OriginalUrl
                ?? r.Images.FirstOrDefault()?.OriginalUrl,
            Category = new SearchRecipeCategorySummaryDto
            {
                Id = r.Category.Id,
                Name = r.Category.Name,
                Slug = r.Category.Slug
            },
            Author = new SearchRecipeAuthorSummaryDto
            {
                Id = r.AuthorId,
                DisplayName = r.Author.DisplayName,
                AvatarUrl = r.Author.AvatarUrl
            },
            Difficulty = r.Difficulty.ToString(),
            PrepTime = r.PrepTime,
            CookTime = r.CookTime,
            Servings = r.Servings,
            RelevanceScore = scores.TryGetValue(r.Id, out var score) ? score : 0,
            CreatedAt = r.CreatedAt
        }).ToList();

        var paged = new PagedResult<SearchRecipeSummaryDto>(mapped, totalCount, request.Page, request.PageSize);
        return ApiResponse<PagedResult<SearchRecipeSummaryDto>>.Ok(paged, $"Tìm thấy {totalCount} kết quả cho '{keyword}'.");
    }

    private static (string SortBy, string SortOrder) ResolveSort(SearchRecipesQuery request)
    {
        if (!string.IsNullOrWhiteSpace(request.SortBy) || !string.IsNullOrWhiteSpace(request.SortOrder))
        {
            var sortBy = string.IsNullOrWhiteSpace(request.SortBy) ? "relevance" : request.SortBy.Trim().ToLowerInvariant();
            return (sortBy, sortBy == "relevance" ? "desc" : (request.SortOrder ?? "desc").Trim().ToLowerInvariant());
        }

        if (!string.IsNullOrWhiteSpace(request.Sort))
        {
            var legacy = request.Sort.Trim();
            var descending = legacy.StartsWith("-", StringComparison.Ordinal);
            var field = descending ? legacy[1..] : legacy;
            return (field.Equals("relevance", StringComparison.OrdinalIgnoreCase) ? "relevance" : field.ToLowerInvariant(), descending ? "desc" : "asc");
        }

        return ("relevance", "desc");
    }

    private static string NormalizeKeyword(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return string.Empty;
        }

        var normalized = input.Trim();
        normalized = normalized.ToLowerInvariant().Replace('đ', 'd');
        normalized = normalized.Normalize(NormalizationForm.FormD);

        var builder = new StringBuilder();
        foreach (var ch in normalized)
        {
            var unicodeCategory = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch);
            if (unicodeCategory != System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                builder.Append(ch);
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
