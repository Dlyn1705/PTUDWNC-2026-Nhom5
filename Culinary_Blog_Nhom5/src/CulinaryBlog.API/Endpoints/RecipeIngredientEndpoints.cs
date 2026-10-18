using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Features.Recipes.Ingredients;
using CulinaryBlog.Domain.Exceptions;
using MediatR;

namespace CulinaryBlog.API.Endpoints;

public static class RecipeIngredientEndpoints
{
    public static IEndpointRouteBuilder MapRecipeIngredientEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/recipes/{recipeId:guid}/ingredients")
            .WithTags("Ingredients").RequireAuthorization("AuthorPolicy");

        group.MapGet("/", async (Guid recipeId, ISender sender, HttpContext context, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetRecipeIngredientsQuery(recipeId), ct);
            SetVersion(context, result);
            return Results.Ok(ApiResponse<IReadOnlyList<IngredientDto>>.Ok(result.Ingredients));
        }).WithName("GetRecipeIngredients").Produces<ApiResponse<IReadOnlyList<IngredientDto>>>(200)
            .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404);

        group.MapPost("/", async (Guid recipeId, IngredientInput input, ISender sender, HttpContext context, CancellationToken ct) =>
        {
            var result = await Change(sender, new(recipeId, IngredientOperation.Add, ReadVersion(context), Input: input), ct);
            SetVersion(context, result);
            // The collection is a readable Location; no non-existent item GET route is advertised.
            return Results.Created($"/api/v1/recipes/{recipeId}/ingredients", ApiResponse<IngredientDto>.Ok(result.Ingredients[^1]));
        }).WithName("AddRecipeIngredient").Produces<ApiResponse<IngredientDto>>(201)
            .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(409).ProducesProblem(422);

        group.MapPut("/{ingredientId:guid}", async (Guid recipeId, Guid ingredientId, IngredientInput input,
            ISender sender, HttpContext context, CancellationToken ct) =>
        {
            var result = await Change(sender, new(recipeId, IngredientOperation.Update, ReadVersion(context), ingredientId, input), ct);
            SetVersion(context, result);
            return Results.Ok(ApiResponse<IngredientDto>.Ok(result.Ingredients.Single(x => x.Id == ingredientId)));
        }).WithName("UpdateRecipeIngredient").Produces<ApiResponse<IngredientDto>>(200)
            .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(409).ProducesProblem(422);

        group.MapDelete("/{ingredientId:guid}", async (Guid recipeId, Guid ingredientId, ISender sender,
            HttpContext context, CancellationToken ct) =>
        {
            var result = await Change(sender, new(recipeId, IngredientOperation.Delete, ReadVersion(context), ingredientId), ct);
            SetVersion(context, result);
            return Results.NoContent();
        }).WithName("DeleteRecipeIngredient").Produces(204)
            .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(409).ProducesProblem(422);

        group.MapPut("/reorder", async (Guid recipeId, ReorderIngredientsRequest input, ISender sender,
            HttpContext context, CancellationToken ct) =>
        {
            var result = await Change(sender, new(recipeId, IngredientOperation.Reorder, ReadVersion(context), IngredientIds: input.IngredientIds), ct);
            SetVersion(context, result);
            return Results.Ok(ApiResponse<IReadOnlyList<IngredientDto>>.Ok(result.Ingredients));
        }).WithName("ReorderRecipeIngredients").Produces<ApiResponse<IReadOnlyList<IngredientDto>>>(200)
            .ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(409).ProducesProblem(422);
        return app;
    }

    private static Task<IngredientSnapshot> Change(ISender sender, IngredientMutation mutation, CancellationToken ct) =>
        sender.Send(new ChangeRecipeIngredientsCommand(mutation), ct);

    private static void SetVersion(HttpContext context, IngredientSnapshot snapshot)
    {
        context.Response.Headers.ETag = $"\"{snapshot.RowVersion}\"";
        context.Response.Headers.CacheControl = "no-store";
    }

    private static byte[] ReadVersion(HttpContext context)
    {
        var value = context.Request.Headers.IfMatch.ToString();
        if (value.Length >= 2 && value.StartsWith('"') && value.EndsWith('"'))
        {
            try
            {
                var bytes = Convert.FromBase64String(value[1..^1]);
                if (bytes.Length == 16) return bytes;
            }
            catch (FormatException) { }
        }
        throw new ValidationException("If-Match", "Cần gửi ETag hiện tại của công thức trong If-Match.");
    }
}

public sealed record ReorderIngredientsRequest(IReadOnlyList<Guid>? IngredientIds);
