using System.Text.Json;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Features.Recipes.Steps;
using CulinaryBlog.Domain.Exceptions;
using MediatR;

namespace CulinaryBlog.API.Endpoints;

public static class RecipeStepEndpoints
{
    public static IEndpointRouteBuilder MapRecipeStepEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/recipes/{recipeId:guid}/steps").WithTags("Steps").RequireAuthorization("AuthorPolicy");
        group.MapGet("/", async (Guid recipeId, ISender sender, HttpContext context, CancellationToken ct) =>
        {
            var snapshot = await sender.Send(new GetRecipeStepsQuery(recipeId), ct);
            SetVersion(context, snapshot);
            return Results.Ok(ApiResponse<IReadOnlyList<StepDto>>.Ok(snapshot.Steps));
        }).WithName("GetRecipeSteps").RequireRateLimiting("recipe-read")
            .Produces<ApiResponse<IReadOnlyList<StepDto>>>(200).ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(429);
        group.MapGet("/{stepId:guid}", async (Guid recipeId, Guid stepId, ISender sender, HttpContext context, CancellationToken ct) =>
        {
            var snapshot = await sender.Send(new GetRecipeStepsQuery(recipeId), ct);
            var step = snapshot.Steps.SingleOrDefault(s => s.Id == stepId) ?? throw new NotFoundException("RecipeStep", stepId);
            SetVersion(context, snapshot);
            return Results.Ok(ApiResponse<StepDto>.Ok(step));
        }).WithName("GetRecipeStep").RequireRateLimiting("recipe-read")
            .Produces<ApiResponse<StepDto>>(200).ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(429);
        group.MapPost("/", async (Guid recipeId, JsonElement body, ISender sender, HttpContext context, CancellationToken ct) =>
        {
            var snapshot = await Change(sender, new(recipeId, StepOperation.Add, ReadVersion(context), Input: StepRules.Parse(body)), ct);
            SetVersion(context, snapshot);
            var step = snapshot.Steps[^1];
            return Results.Created($"/api/v1/recipes/{recipeId}/steps/{step.Id}", ApiResponse<StepDto>.Ok(step));
        }).WithName("AddRecipeStep").RequireRateLimiting("recipe-write")
            .Produces<ApiResponse<StepDto>>(201).ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(409).ProducesProblem(422).ProducesProblem(429);
        group.MapPut("/{stepId:guid}", async (Guid recipeId, Guid stepId, JsonElement body, ISender sender, HttpContext context, CancellationToken ct) =>
        {
            var snapshot = await Change(sender, new(recipeId, StepOperation.Update, ReadVersion(context), stepId, StepRules.Parse(body)), ct);
            SetVersion(context, snapshot);
            return Results.Ok(ApiResponse<StepDto>.Ok(snapshot.Steps.Single(s => s.Id == stepId)));
        }).WithName("UpdateRecipeStep").RequireRateLimiting("recipe-write")
            .Produces<ApiResponse<StepDto>>(200).ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(409).ProducesProblem(422).ProducesProblem(429);
        group.MapDelete("/{stepId:guid}", async (Guid recipeId, Guid stepId, ISender sender, HttpContext context, CancellationToken ct) =>
        {
            var snapshot = await Change(sender, new(recipeId, StepOperation.Delete, ReadVersion(context), stepId), ct);
            SetVersion(context, snapshot);
            return Results.NoContent();
        }).WithName("DeleteRecipeStep").RequireRateLimiting("recipe-write")
            .Produces(204).ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(409).ProducesProblem(422).ProducesProblem(429);
        group.MapPut("/reorder", async (Guid recipeId, ReorderStepsRequest body, ISender sender, HttpContext context, CancellationToken ct) =>
        {
            var snapshot = await Change(sender, new(recipeId, StepOperation.Reorder, ReadVersion(context), StepIds: body.StepIds), ct);
            SetVersion(context, snapshot);
            return Results.Ok(ApiResponse<IReadOnlyList<StepDto>>.Ok(snapshot.Steps));
        }).WithName("ReorderRecipeSteps").RequireRateLimiting("recipe-write")
            .Produces<ApiResponse<IReadOnlyList<StepDto>>>(200).ProducesProblem(401).ProducesProblem(403).ProducesProblem(404).ProducesProblem(409).ProducesProblem(422).ProducesProblem(429);
        return app;
    }

    private static Task<StepSnapshot> Change(ISender sender, StepMutation mutation, CancellationToken ct) => sender.Send(new ChangeRecipeStepsCommand(mutation), ct);
    private static void SetVersion(HttpContext context, StepSnapshot snapshot)
    { context.Response.Headers.ETag = $"\"{snapshot.RowVersion}\""; context.Response.Headers.CacheControl = "no-store"; }
    private static byte[] ReadVersion(HttpContext context)
    {
        var raw = context.Request.Headers.IfMatch.ToString();
        if (raw.Length >= 2 && raw.StartsWith('"') && raw.EndsWith('"'))
        {
            try { var bytes = Convert.FromBase64String(raw[1..^1]); if (bytes.Length == 16 && Convert.ToBase64String(bytes) == raw[1..^1]) return bytes; }
            catch (FormatException) { }
        }
        throw new ValidationException("If-Match", "Cần gửi ETag hiện tại của công thức trong If-Match.");
    }
}

public sealed record ReorderStepsRequest(IReadOnlyList<Guid>? StepIds);
