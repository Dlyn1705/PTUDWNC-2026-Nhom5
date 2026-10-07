using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Auth.Commands.GoogleIdTokenLogin;
using CulinaryBlog.Application.Features.Auth.Commands.Refresh;
using CulinaryBlog.Application.Features.Auth.Commands.Register;
using CulinaryBlog.Application.Features.Auth.Commands.Login;
using MediatR;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace CulinaryBlog.API.Endpoints;

public static class AuthEndpoints
{
    private const string RefreshCookieName = "culinary_refresh_token";

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/auth")
            .WithTags("Authentication")
            .RequireRateLimiting("auth");

        group.MapGet("/ping", () => Results.Ok(new { message = "Auth module endpoint group is active." }))
            .WithName("AuthPing")
            .WithSummary("Kiểm tra trạng thái Auth group");

        group.MapPost("/google", async (
            GoogleIdTokenLoginRequest request,
            ISender sender,
            HttpContext context,
            CancellationToken cancellationToken) =>
        {
            var response = await sender.Send(
                new GoogleIdTokenLoginCommand(request.IdToken),
                cancellationToken);
            SetRefreshCookie(context, response);
            return Results.Ok(ToSessionResponse(response));
        })
            .WithName("GoogleLogin")
            .WithSummary("Sign in with a Google ID token")
            .Produces<AuthSessionResponseDto>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity)
            .ProducesProblem(StatusCodes.Status502BadGateway);

        group.MapPost("/register", async (RegisterCommand command, ISender sender, HttpContext context, CancellationToken cancellationToken) =>
        {
            var response = await sender.Send(command, cancellationToken);
            SetRefreshCookie(context, response);
            return Results.Created("/api/v1/auth/me", ToSessionResponse(response));
        })
            .WithName("Register")
            .WithSummary("Đăng ký tài khoản mới")
            .Produces<AuthSessionResponseDto>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/login", async (LoginCommand command, ISender sender, HttpContext context, CancellationToken cancellationToken) =>
        {
            var response = await sender.Send(command, cancellationToken);
            SetRefreshCookie(context, response);
            return Results.Ok(ToSessionResponse(response));
        })
            .WithName("Login")
            .WithSummary("Đăng nhập bằng email và mật khẩu")
            .Produces<AuthSessionResponseDto>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status423Locked);

        group.MapPost("/refresh", async (HttpContext context, ISender sender, CancellationToken cancellationToken) =>
        {
            var refreshToken = context.Request.Cookies[RefreshCookieName];
            if (string.IsNullOrWhiteSpace(refreshToken) && context.Request.HasJsonContentType())
            {
                var body = await context.Request.ReadFromJsonAsync<RefreshTokenRequest>(cancellationToken);
                refreshToken = body?.RefreshToken;
            }

            if (string.IsNullOrWhiteSpace(refreshToken))
            {
                throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
            }

            try
            {
                var response = await sender.Send(new RefreshTokenCommand(refreshToken), cancellationToken);
                SetRefreshCookie(context, response);
                return Results.Ok(ToSessionResponse(response));
            }
            catch (UnauthorizedAccessException)
            {
                ClearRefreshCookie(context);
                throw;
            }
        })
            .WithName("RefreshAuthToken")
            .WithSummary("Làm mới access token và xoay refresh token")
            .Produces<AuthSessionResponseDto>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        group.MapPost("/logout", async (
            HttpContext context,
            IAuthService authService,
            CancellationToken cancellationToken) =>
        {
            var refreshToken = context.Request.Cookies[RefreshCookieName];
            if (string.IsNullOrWhiteSpace(refreshToken) && context.Request.HasJsonContentType())
            {
                var body = await context.Request.ReadFromJsonAsync<RefreshTokenRequest>(cancellationToken);
                refreshToken = body?.RefreshToken;
            }

            if (!string.IsNullOrWhiteSpace(refreshToken))
            {
                await authService.RevokeRefreshTokenAsync(refreshToken, cancellationToken);
            }

            ClearRefreshCookie(context);
            return Results.NoContent();
        })
            .RequireAuthorization()
            .WithName("Logout")
            .WithSummary("Đăng xuất và thu hồi refresh token")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status401Unauthorized);

        return app;
    }

    private static void SetRefreshCookie(HttpContext context, AuthResponseDto response)
    {
        context.Response.Cookies.Append(RefreshCookieName, response.RefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Lax,
            Path = "/api/v1/auth",
            Expires = new DateTimeOffset(DateTime.SpecifyKind(response.RefreshTokenExpiry, DateTimeKind.Utc))
        });
    }

    private static AuthSessionResponseDto ToSessionResponse(AuthResponseDto response)
    {
        return new AuthSessionResponseDto(
            response.AccessToken,
            response.AccessTokenExpiry,
            response.User,
            response.Roles);
    }

    private static void ClearRefreshCookie(HttpContext context)
    {
        context.Response.Cookies.Delete(RefreshCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Lax,
            Path = "/api/v1/auth"
        });
    }
}

/// <summary>Refresh token payload for non-browser API clients.</summary>
public sealed record RefreshTokenRequest(string RefreshToken);

/// <summary>Google ID token produced by Google Sign-In on the frontend.</summary>
public sealed record GoogleIdTokenLoginRequest(string IdToken);

/// <summary>Public authentication response; the refresh token is only sent as an HttpOnly cookie.</summary>
public sealed record AuthSessionResponseDto(
    string AccessToken,
    DateTime AccessTokenExpiry,
    UserDto User,
    IReadOnlyList<string> Roles);
