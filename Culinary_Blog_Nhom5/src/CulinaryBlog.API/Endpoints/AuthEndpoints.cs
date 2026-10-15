using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Auth.Commands.GoogleIdTokenLogin;
using CulinaryBlog.Application.Features.Auth.Commands.Logout;
using CulinaryBlog.Application.Features.Auth.Commands.Refresh;
using CulinaryBlog.Application.Features.Auth.Commands.Register;
using CulinaryBlog.Application.Features.Auth.Commands.Login;
using MediatR;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;

namespace CulinaryBlog.API.Endpoints;

public static class AuthEndpoints
{
    private const string RefreshCookieName = "culinary_refresh_token";

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/auth")
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
            var refreshToken = await ReadRefreshTokenAsync(context, cancellationToken);

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
            ISender sender,
            IOptionsMonitor<JwtBearerOptions> jwtBearerOptions,
            CancellationToken cancellationToken) =>
        {
            var accessToken = await ValidateLogoutAccessTokenAsync(context, jwtBearerOptions);
            if (accessToken.State == LogoutAccessTokenState.Invalid
                || string.IsNullOrWhiteSpace(accessToken.UserId))
            {
                throw new UnauthorizedAccessException("Access token không hợp lệ.");
            }

            var refreshToken = await ReadRefreshTokenAsync(context, cancellationToken);
            if (string.IsNullOrWhiteSpace(refreshToken))
            {
                throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
            }

            var result = await sender.Send(
                new LogoutCommand(refreshToken, accessToken.UserId),
                cancellationToken);

            // A signed token that is expired may end only its own live session.
            // A valid bearer remains idempotent for unknown or already-ended tokens.
            if (accessToken.State == LogoutAccessTokenState.Expired
                && result is not RefreshTokenRevocationResult.Revoked)
            {
                throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
            }

            ClearRefreshCookie(context);
            return Results.NoContent();
        })
            .WithName("Logout")
            .WithSummary("Thu hồi refresh token của phiên đăng nhập")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        return app;
    }

    private static async Task<LogoutAccessToken> ValidateLogoutAccessTokenAsync(
        HttpContext context,
        IOptionsMonitor<JwtBearerOptions> jwtBearerOptions)
    {
        var authorization = context.Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(authorization))
        {
            return new LogoutAccessToken(LogoutAccessTokenState.Invalid, null);
        }

        const string bearerPrefix = "Bearer ";
        if (!authorization.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return new LogoutAccessToken(LogoutAccessTokenState.Invalid, null);
        }

        var rawToken = authorization[bearerPrefix.Length..].Trim();
        if (rawToken.Length == 0 || rawToken.Any(char.IsWhiteSpace))
        {
            return new LogoutAccessToken(LogoutAccessTokenState.Invalid, null);
        }

        var authentication = await context.AuthenticateAsync(JwtBearerDefaults.AuthenticationScheme);
        if (authentication.Succeeded)
        {
            var userId = GetUserId(authentication.Principal!);
            return string.IsNullOrWhiteSpace(userId)
                ? new LogoutAccessToken(LogoutAccessTokenState.Invalid, null)
                : new LogoutAccessToken(LogoutAccessTokenState.Valid, userId);
        }

        var validationParameters = jwtBearerOptions
            .Get(JwtBearerDefaults.AuthenticationScheme)
            .TokenValidationParameters
            .Clone();
        validationParameters.ValidateLifetime = false;

        try
        {
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(rawToken, validationParameters, out var securityToken);
            if (securityToken is not JwtSecurityToken jwt)
            {
                return new LogoutAccessToken(LogoutAccessTokenState.Invalid, null);
            }

            var now = DateTime.UtcNow;
            if (jwt.ValidTo == DateTime.MinValue || jwt.ValidTo > now || jwt.ValidFrom > now)
            {
                return new LogoutAccessToken(LogoutAccessTokenState.Invalid, null);
            }

            var userId = GetUserId(principal);
            return string.IsNullOrWhiteSpace(userId)
                ? new LogoutAccessToken(LogoutAccessTokenState.Invalid, null)
                : new LogoutAccessToken(LogoutAccessTokenState.Expired, userId);
        }
        catch (SecurityTokenException)
        {
            return new LogoutAccessToken(LogoutAccessTokenState.Invalid, null);
        }
        catch (ArgumentException)
        {
            return new LogoutAccessToken(LogoutAccessTokenState.Invalid, null);
        }
    }

    private static string? GetUserId(ClaimsPrincipal principal)
    {
        return principal.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? principal.FindFirst("userId")?.Value
            ?? principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
    }

    private static async Task<string?> ReadRefreshTokenAsync(
        HttpContext context,
        CancellationToken cancellationToken)
    {
        var refreshToken = context.Request.Cookies[RefreshCookieName];
        if (string.IsNullOrWhiteSpace(refreshToken) && context.Request.HasJsonContentType())
        {
            var body = await context.Request.ReadFromJsonAsync<RefreshTokenRequest>(cancellationToken);
            refreshToken = body?.RefreshToken;
        }

        return refreshToken;
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

    private sealed record LogoutAccessToken(LogoutAccessTokenState State, string? UserId);

    private enum LogoutAccessTokenState
    {
        Valid,
        Expired,
        Invalid
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
