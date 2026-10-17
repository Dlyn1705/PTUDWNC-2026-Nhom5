using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Auth.Commands.Register;
using MediatR;

namespace CulinaryBlog.API.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/auth")
            .WithTags("Authentication");

        group.MapGet("/ping", () => Results.Ok(new { message = "Auth module endpoint group is active." }))
            .WithName("AuthPing")
            .WithSummary("Kiểm tra trạng thái Auth group");

        group.MapPost("/register", async (RegisterCommand command, ISender sender, CancellationToken cancellationToken) =>
            Results.Json(
                await sender.Send(command, cancellationToken),
                statusCode: StatusCodes.Status201Created))
            .WithName("Register")
            .WithSummary("Đăng ký tài khoản mới, chưa tạo phiên đăng nhập")
            .Produces<UserDto>(StatusCodes.Status201Created);

        return app;
    }
}
