using CulinaryBlog.Application.Features.Recipes.Commands.UploadRecipeImage;
using CulinaryBlog.Domain.Exceptions;
using Xunit;

namespace CulinaryBlog.Security.Tests;

public sealed class UploadInputSecurityTests
{
    private static readonly byte[] PngHeader = [137, 80, 78, 71, 13, 10, 26, 10];

    [Fact]
    public async Task Declared_mime_must_match_magic_bytes_before_storage()
    {
        await using var stream = new MemoryStream(PngHeader);
        await Assert.ThrowsAsync<ValidationException>(() =>
            ImageFileValidation.DetectAsync(stream, "image.png", "image/jpeg", default));
    }

    [Theory]
    [InlineData("../escape.png")]
    [InlineData("..\\escape.png")]
    [InlineData("folder/image.png")]
    public async Task Filename_with_path_segments_is_rejected_before_storage(string name)
    {
        await using var stream = new MemoryStream(PngHeader);
        await Assert.ThrowsAsync<ValidationException>(() =>
            ImageFileValidation.DetectAsync(stream, name, "image/png", default));
    }

    [Fact]
    public void More_than_five_mib_is_rejected_before_handler_runs()
    {
        using var stream = new MemoryStream(PngHeader);
        var command = new UploadRecipeImageCommand(Guid.NewGuid(), stream, "image.png", "image/png",
            5 * 1024 * 1024 + 1, null);
        Assert.False(new UploadRecipeImageCommandValidator().Validate(command).IsValid);
    }
}
