using System.Text.Json.Serialization;

namespace CulinaryBlog.Application.Common.Models;

/// <summary>
/// Standard response envelope for a single successful resource.
/// Paginated endpoints return <see cref="PagedResult{T}"/> directly so their
/// wire shape remains <c>{ data, meta }</c>.
/// </summary>
public sealed class ApiResponse<T>
{
    [JsonPropertyName("data")]
    public T? Data { get; init; }

    public static ApiResponse<T> Ok(T data)
    {
        return new ApiResponse<T>
        {
            Data = data
        };
    }
}
