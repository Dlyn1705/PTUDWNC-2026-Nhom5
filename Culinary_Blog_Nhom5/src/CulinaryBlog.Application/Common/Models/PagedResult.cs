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

    // The public JSON contract exposes only data/meta. Keep a matching
    // constructor so cached responses can be deserialized without losing the
    // backing pagination state (Items, Page, PageSize and TotalCount).
    [JsonConstructor]
    public PagedResult(IReadOnlyList<T> data, PaginationMeta meta)
    {
        Items = data ?? Array.Empty<T>();
        TotalCount = meta?.TotalCount ?? 0;
        Page = meta?.Page ?? 1;
        PageSize = meta?.PageSize ?? 0;
    }

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
