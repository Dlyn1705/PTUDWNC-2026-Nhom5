using System;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipeImage;

public sealed record DeleteRecipeImageCommand(Guid RecipeId, Guid ImageId) : IRequest;
