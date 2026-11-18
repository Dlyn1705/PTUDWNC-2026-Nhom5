using System.Text.Json.Serialization;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Features.Auth.Admin;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace CulinaryBlog.API.Endpoints;

public sealed record SetUserRoleRequest(string Role);
public sealed record AdminUserResponse(
    [property: JsonPropertyName("data")] AdminUserDto Data);

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/admin/users")
            .WithTags("Admin")
            .RequireAuthorization("AdminOnly");

        group.MapGet("/", async Task<IResult> (
            int? page,
            int? pageSize,
            string? role,
            [FromServices] ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ListAdminUsersQuery(
                page ?? 1, pageSize ?? 20, role), cancellationToken);
            return Results.Ok(result);
        })
        .WithName("AdminListUsers")
        .WithSummary("Danh sách tài khoản Admin/Author với phân trang và lọc role")
        .WithDescription("Query: page mặc định 1; pageSize mặc định 20, tối đa 50; role chỉ nhận Admin hoặc Author. Sắp xếp createdAt giảm dần, id tăng dần.")
        .Produces<PagedResult<AdminUserDto>>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        group.MapPost("/{userId}/roles", async Task<IResult> (
            string userId,
            SetUserRoleRequest request,
            [FromServices] ISender sender,
            CancellationToken cancellationToken) =>
        {
            var changed = await sender.Send(new SetAdminUserRoleCommand(
                userId, request.Role), cancellationToken);
            return Results.Ok(new AdminUserResponse(changed));
        })
        .WithName("AdminSetUserRole")
        .WithSummary("Đặt role Admin hoặc Author cho tài khoản")
        .Produces<AdminUserResponse>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound)
        .ProducesProblem(StatusCodes.Status409Conflict)
        .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        return app;
    }
}
