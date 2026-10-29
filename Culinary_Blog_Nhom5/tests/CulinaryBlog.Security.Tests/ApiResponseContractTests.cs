using System.Text.Json;
using CulinaryBlog.Application.Common.Models;
using Xunit;

namespace CulinaryBlog.Security.Tests;

public sealed class ApiResponseContractTests
{
    [Fact]
    public void Single_success_response_contains_only_data()
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(
            ApiResponse<object>.Ok(new { id = "recipe-1" }),
            new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        var root = document.RootElement;
        Assert.True(root.TryGetProperty("data", out var data));
        Assert.Equal("recipe-1", data.GetProperty("id").GetString());
        Assert.False(root.TryGetProperty("success", out _));
        Assert.False(root.TryGetProperty("message", out _));
    }

    [Fact]
    public void Paginated_success_response_contains_data_and_meta()
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(
            new PagedResult<string>(new[] { "recipe-1" }, totalCount: 1, page: 1, pageSize: 12),
            new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        var root = document.RootElement;
        Assert.Equal("recipe-1", root.GetProperty("data")[0].GetString());
        Assert.Equal(1, root.GetProperty("meta").GetProperty("page").GetInt32());
        Assert.False(root.TryGetProperty("success", out _));
        Assert.False(root.TryGetProperty("message", out _));
    }
}
