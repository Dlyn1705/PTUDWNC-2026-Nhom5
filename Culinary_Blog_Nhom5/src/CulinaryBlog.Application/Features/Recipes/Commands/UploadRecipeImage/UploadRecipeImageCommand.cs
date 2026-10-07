using System.IO;
using CulinaryBlog.Application.DTOs;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Commands.UploadRecipeImage;

public sealed record UploadRecipeImageCommand(
    Guid RecipeId,
    Stream Content,
    string FileName,
    string ContentType,
    long Length,
    string? AltText) : IRequest<RecipeImageDto>;
