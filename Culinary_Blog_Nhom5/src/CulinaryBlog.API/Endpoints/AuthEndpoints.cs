using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Auth.Commands.GoogleLogin;
using CulinaryBlog.Application.Features.Auth.Commands.GoogleIdTokenLogin;
using CulinaryBlog.Application.Features.Auth.Commands.Refresh;
using CulinaryBlog.Application.Features.Auth.Commands.Register;
using CulinaryBlog.Application.Features.Auth.Commands.Login;
using MediatR;
using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using Microsoft.Extensions.Configuration;

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

        group.MapGet("/google", (HttpContext context, IConfiguration configuration) =>
        {
            if (string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientId"])
                || string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientSecret"]))
            {
                throw new BadGatewayException("Google OAuth credentials are not configured on the server.");
            }

            var properties = new AuthenticationProperties
            {
                RedirectUri = "/api/v1/auth/google/complete"
            };

            return Results.Challenge(properties, [GoogleDefaults.AuthenticationScheme]);
        })
            .WithName("StartGoogleLogin")
            .WithSummary("Bắt đầu Google OAuth Authorization Code Flow với PKCE")
            .Produces(StatusCodes.Status302Found)
            .ProducesProblem(StatusCodes.Status502BadGateway);

        group.MapGet("/google/complete", CompleteGoogleSignInAsync)
            .WithName("CompleteGoogleLogin")
            .WithSummary("Hoàn tất đăng nhập Google sau callback OAuth")
            .Produces<AuthSessionResponseDto>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status502BadGateway);

        group.MapPost("/google", CompleteGoogleSignInAsync)
            .WithName("GoogleLogin")
            .WithSummary("Đăng nhập bằng Google ID token hoặc external authentication cookie")
            .Produces<AuthSessionResponseDto>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status502BadGateway);

        group.MapPost("/register", async (RegisterCommand command, ISender sender, HttpContext context, CancellationToken cancellationToken) =>
        {
            var response = await sender.Send(command, cancellationToken);
            SetRefreshCookie(context, response);
            return Results.Created("/api/v1/auth/me", response);
        })
            .WithName("Register")
            .WithSummary("Register a new account")
            .Produces<AuthResponseDto>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/login", async (LoginCommand command, ISender sender, HttpContext context, CancellationToken cancellationToken) =>
        {
            var response = await sender.Send(command, cancellationToken);
            SetRefreshCookie(context, response);
            return Results.Ok(response);
        })
            .WithName("Login")
            .WithSummary("Sign in with email and password")
            .Produces<AuthResponseDto>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized);

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
                ClearRefreshCookie(context);
                throw new UnauthorizedAccessException("Refresh token is missing or expired.");
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
            .WithSummary("Rotate the refresh token and issue a new access token")
            .Produces<AuthSessionResponseDto>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized);
        return app;
    }


    private static void SetRefreshCookie(HttpContext context, AuthResponseDto response)
    {
        var isLocalhost = context.Request.Host.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || context.Request.Host.Host == "127.0.0.1"
            || context.Request.Host.Host == "[::1]";

        context.Response.Cookies.Append(RefreshCookieName, response.RefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = context.Request.IsHttps || isLocalhost,
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

    private static async Task<IResult> CompleteGoogleSignInAsync(
        HttpContext context,
        ISender sender,
        SignInManager<ApplicationUser> signInManager,
        CancellationToken cancellationToken)
    {
        if (context.Request.ContentLength is > 0 && !context.Request.HasJsonContentType())
        {
            throw new BadRequestException("invalid token");
        }

        if (context.Request.HasJsonContentType())
        {
            GoogleIdTokenLoginRequest? request;
            try
            {
                request = await context.Request.ReadFromJsonAsync<GoogleIdTokenLoginRequest>(cancellationToken);
            }
            catch (JsonException)
            {
                throw new BadRequestException("invalid token");
            }

            if (string.IsNullOrWhiteSpace(request?.IdToken))
            {
                throw new BadRequestException("invalid token");
            }

            var tokenResponse = await sender.Send(
                new GoogleIdTokenLoginCommand(request.IdToken),
                cancellationToken);
            SetRefreshCookie(context, tokenResponse);
            return Results.Ok(ToSessionResponse(tokenResponse));
        }

        var externalLoginInfo = await signInManager.GetExternalLoginInfoAsync();
        if (externalLoginInfo is null)
        {
            await context.SignOutAsync(IdentityConstants.ExternalScheme);
            if (context.Request.HasJsonContentType())
            {
                throw new BadRequestException("invalid token: no valid Google authorization session was found.");
            }

            throw new UnauthorizedAccessException("Google authorization session is invalid or expired.");
        }

        try
        {
            var response = await sender.Send(
                new GoogleLoginCommand(externalLoginInfo),
                cancellationToken);
            SetRefreshCookie(context, response);
            return Results.Ok(ToSessionResponse(response));
        }
        finally
        {
            await context.SignOutAsync(IdentityConstants.ExternalScheme);
        }
    }

    private static void ClearRefreshCookie(HttpContext context)
    {
        var isLocalhost = context.Request.Host.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || context.Request.Host.Host == "127.0.0.1"
            || context.Request.Host.Host == "[::1]";

        context.Response.Cookies.Delete(RefreshCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = context.Request.IsHttps || isLocalhost,
            SameSite = SameSiteMode.Lax,
            Path = "/api/v1/auth"
        });
    }
}

/// <summary>Refresh token payload for non-browser API clients.</summary>
public sealed record RefreshTokenRequest(string RefreshToken);

/// <summary>Google ID token issued to the server-side Auth.js callback.</summary>
public sealed record GoogleIdTokenLoginRequest(string IdToken);

/// <summary>Public authentication response; the refresh token is only sent as an HttpOnly cookie.</summary>
public sealed record AuthSessionResponseDto(
    string AccessToken,
    DateTime AccessTokenExpiry,
    UserDto User,
    IReadOnlyList<string> Roles);
