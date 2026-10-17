using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace CulinaryBlog.Application.Common.Models;

public class PagedResult<T>
{
    [JsonIgnore]
    public IReadOnlyList<T> Items { get; init; } = Array.Empty<T>();

    [JsonIgnore]
    public int TotalCount { get; init; }

    [JsonIgnore]
    public int Page { get; init; }

    [JsonIgnore]
    public int PageSize { get; init; }

    [JsonIgnore]
    public int TotalPages => PageSize > 0 ? (int)Math.Ceiling((double)TotalCount / PageSize) : 0;

    [JsonIgnore]
    public bool HasNextPage => Page < TotalPages;

    [JsonIgnore]
    public bool HasPreviousPage => Page > 1;

    [JsonPropertyName("data")]
    public IReadOnlyList<T> Data => Items;

    [JsonPropertyName("meta")]
    public PaginationMeta Meta => new(
        Page,
        PageSize,
        TotalCount,
        TotalPages,
        HasNextPage,
        HasPreviousPage);

    public PagedResult() { }

    public PagedResult(IReadOnlyList<T> items, int totalCount, int page, int pageSize)
    {
        Items = items;
        TotalCount = totalCount;
        Page = page;
        PageSize = pageSize;
    }
}

public sealed record PaginationMeta(
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages,
    bool HasNextPage,
    bool HasPreviousPage);
