using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Mail;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Auth.Commands.GoogleIdTokenLogin;
using CulinaryBlog.Application.Features.Auth.Commands.Login;
using CulinaryBlog.Application.Features.Auth.Commands.Refresh;
using CulinaryBlog.Application.Features.Auth.Commands.Register;
using CulinaryBlog.Domain.Exceptions;
using FluentValidation;
using ValidationException = CulinaryBlog.Domain.Exceptions.ValidationException;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace CulinaryBlog.API.Endpoints;

public static class AuthEndpoints
{
    private const string RefreshCookieName = "culinary_refresh_token";

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/auth")
            .WithTags("Authentication")
            .RequireRateLimiting("auth")
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        group.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            context.HttpContext.Response.Headers.Pragma = "no-cache";
            return await next(context);
        });

        group.MapGet("/ping", () => Results.Ok(ApiResponse<object>.Ok(new { message = "Auth module endpoint group is active." })))
            .WithName("AuthPing")
            .Produces<ApiResponse<object>>(StatusCodes.Status200OK)
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
                return Results.Ok(ApiResponse<AuthSessionResponseDto>.Ok(ToSessionResponse(response)));
            })
            .WithName("GoogleLogin")
            .WithSummary("Sign in with a Google ID token")
            .Produces<ApiResponse<AuthSessionResponseDto>>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity)
            .ProducesProblem(StatusCodes.Status502BadGateway);

        group.MapPost("/register", async (
                RegisterCommand command,
                ISender sender,
                HttpContext context,
                CancellationToken cancellationToken) =>
            {
                var response = await sender.Send(command, cancellationToken);
                SetRefreshCookie(context, response);
                return Results.Created("/api/v1/auth/me", ApiResponse<AuthSessionResponseDto>.Ok(ToSessionResponse(response)));
            })
            .WithName("Register")
            .WithSummary("Đăng ký tài khoản mới")
            .Produces<ApiResponse<AuthSessionResponseDto>>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/login", async (
                LoginCommand command,
                ISender sender,
                HttpContext context,
                CancellationToken cancellationToken) =>
            {
                var response = await sender.Send(command, cancellationToken);
                SetRefreshCookie(context, response);
                return Results.Ok(ApiResponse<AuthSessionResponseDto>.Ok(ToSessionResponse(response)));
            })
            .WithName("Login")
            .WithSummary("Đăng nhập bằng email và mật khẩu")
            .Produces<ApiResponse<AuthSessionResponseDto>>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status423Locked);

        group.MapPost("/refresh", async (
                HttpContext context,
                ISender sender,
                CancellationToken cancellationToken) =>
            {
                var refreshToken = await ReadRefreshTokenAsync(context, cancellationToken);

                if (string.IsNullOrWhiteSpace(refreshToken))
                {
                    ClearRefreshCookie(context);
                    throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
                }

                try
                {
                    var response = await sender.Send(new RefreshTokenCommand(refreshToken), cancellationToken);
                    SetRefreshCookie(context, response);
                    return Results.Ok(ApiResponse<AuthSessionResponseDto>.Ok(ToSessionResponse(response)));
                }
                catch (UnauthorizedAccessException)
                {
                    ClearRefreshCookie(context);
                    throw;
                }
                catch (LockedException)
                {
                    ClearRefreshCookie(context);
                    throw;
                }
            })
            .WithName("RefreshAuthToken")
            .WithSummary("Làm mới access token và xoay refresh token")
            .Produces<ApiResponse<AuthSessionResponseDto>>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity)
            .ProducesProblem(StatusCodes.Status423Locked)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        group.MapPost("/logout", async (
                HttpContext context,
                IAuthService authService,
                CancellationToken cancellationToken) =>
            {
                var refreshToken = await ReadRefreshTokenAsync(context, cancellationToken);
                if (string.IsNullOrWhiteSpace(refreshToken))
                {
                    ClearRefreshCookie(context);
                    throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
                }

                var revocation = await authService.RevokeRefreshTokenAsync(refreshToken, cancellationToken);
                if (revocation == RefreshTokenRevocationResult.Forbidden)
                {
                    ClearRefreshCookie(context);
                    throw new ForbiddenException("Chỉ Author hoặc Admin mới được đăng xuất.");
                }

                if (revocation != RefreshTokenRevocationResult.Revoked)
                {
                    ClearRefreshCookie(context);
                    throw new UnauthorizedAccessException("Refresh token không hợp lệ hoặc đã hết hạn.");
                }

                ClearRefreshCookie(context);
                return Results.NoContent();
            })
            .WithName("Logout")
            .WithSummary("Thu hồi refresh token và các token kế tiếp của phiên đăng nhập")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapPost("/forgot-password", async (
                ForgotPasswordRequest request, IAuthService authService, CancellationToken cancellationToken) =>
            {
                ValidateEmail(request.Email);
                await authService.RequestPasswordResetAsync(request.Email, cancellationToken);
                return Results.Accepted(value: ApiResponse<object>.Ok(new
                {
                    message = "Nếu email có tài khoản, hướng dẫn đặt lại mật khẩu sẽ được gửi."
                }));
            })
            .WithName("ForgotPassword")
            .Produces(StatusCodes.Status202Accepted)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        group.MapPost("/reset-password", async (
                ResetPasswordRequest request, IAuthService authService, CancellationToken cancellationToken) =>
            {
                ValidateEmail(request.Email);
                if (string.IsNullOrWhiteSpace(request.Token) || request.Token.Length > 256)
                    throw new ValidationException("Token", "Invalid reset token.");
                if (string.IsNullOrWhiteSpace(request.NewPassword))
                    throw new ValidationException("NewPassword", "New password is required.");
                await authService.ResetPasswordAsync(request.Email, request.Token, request.NewPassword, cancellationToken);
                return Results.NoContent();
            })
            .WithName("ResetPassword")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        group.MapPost("/change-password", async (
                ChangePasswordRequest request, HttpContext context, IAuthService authService,
                IValidator<ChangePasswordDto> validator,
                CancellationToken cancellationToken) =>
            {
                var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? throw new UnauthorizedAccessException("Authentication required.");
                var validation = await validator.ValidateAsync(
                    new ChangePasswordDto(request.CurrentPassword, request.NewPassword), cancellationToken);
                if (!validation.IsValid)
                    throw new ValidationException(validation.Errors
                        .GroupBy(error => error.PropertyName)
                        .ToDictionary(group => group.Key, group => group.Select(error => error.ErrorMessage).ToArray()));
                await authService.ChangePasswordAsync(userId, request.CurrentPassword, request.NewPassword, cancellationToken);
                ClearRefreshCookie(context);
                return Results.NoContent();
            })
            .RequireAuthorization("AuthorPolicy")
            .WithName("ChangePassword")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        group.MapGet("/me", async (
                ClaimsPrincipal principal, IAuthService authService, CancellationToken cancellationToken) =>
            {
                var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? throw new UnauthorizedAccessException("Authentication required.");
                var profile = await authService.GetCurrentUserAsync(userId, cancellationToken);
                return Results.Ok(ApiResponse<CurrentUserDto>.Ok(profile));
            })
            .RequireAuthorization()
            .WithName("GetCurrentUser")
            .WithSummary("Get the safe profile of the authenticated user")
            .Produces<ApiResponse<CurrentUserDto>>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPatch("/me", async (
                UpdateProfileRequest request, ClaimsPrincipal principal, IAuthService authService,
                IValidator<UpdateProfileDto> validator, CancellationToken cancellationToken) =>
            {
                var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? throw new UnauthorizedAccessException("Authentication required.");
                var update = new UpdateProfileDto(request.DisplayName, request.Bio, request.AvatarUrl);
                var validation = await validator.ValidateAsync(update, cancellationToken);
                if (!validation.IsValid)
                    throw new ValidationException(validation.Errors
                        .GroupBy(error => error.PropertyName)
                        .ToDictionary(group => group.Key, group => group.Select(error => error.ErrorMessage).ToArray()));
                var profile = await authService.UpdateCurrentUserAsync(userId, update, cancellationToken);
                return Results.Ok(ApiResponse<CurrentUserDto>.Ok(profile));
            })
            .RequireAuthorization()
            .WithName("UpdateCurrentUser")
            .WithSummary("Update the authenticated user's display name, bio, or avatar")
            .Produces<ApiResponse<CurrentUserDto>>(StatusCodes.Status200OK)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity);

        return app;
    }

    private static void ValidateEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 256
            || !MailAddress.TryCreate(email, out var parsed)
            || !string.Equals(parsed.Address, email.Trim(), StringComparison.OrdinalIgnoreCase))
            throw new ValidationException("Email", "Valid email is required.");
    }

    private static async Task<string?> ReadRefreshTokenAsync(
        HttpContext context,
        CancellationToken cancellationToken)
    {
        var refreshToken = context.Request.Cookies[RefreshCookieName];
        if (string.IsNullOrWhiteSpace(refreshToken) && context.Request.HasJsonContentType())
        {
            try
            {
                var body = await context.Request.ReadFromJsonAsync<RefreshTokenRequest>(cancellationToken);
                refreshToken = body?.RefreshToken;
            }
            catch (JsonException)
            {
                throw new BadRequestException("Refresh token payload must be valid JSON.");
            }
        }

        if (refreshToken?.Length > 256)
        {
            throw new ValidationException("RefreshToken", "Refresh token must not exceed 256 characters.");
        }

        return refreshToken;
    }

    private static void SetRefreshCookie(HttpContext context, AuthResponseDto response)
    {
        context.Response.Cookies.Append(
            RefreshCookieName,
            response.RefreshToken,
            new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Lax,
                Path = "/api/v1/auth",
                Expires = new DateTimeOffset(DateTime.SpecifyKind(response.RefreshTokenExpiry, DateTimeKind.Utc))
            });
    }

    private static AuthSessionResponseDto ToSessionResponse(AuthResponseDto response) =>
        new(response.AccessToken, response.AccessTokenExpiry, response.User, response.Roles);

    private static void ClearRefreshCookie(HttpContext context) =>
        context.Response.Cookies.Delete(
            RefreshCookieName,
            new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Lax,
                Path = "/api/v1/auth"
            });
}

public static class LogoutAuthorization
{
    public static bool HasRequiredRole(ClaimsPrincipal principal) =>
        principal.Claims.Any(claim =>
            (claim.Type == ClaimTypes.Role || claim.Type == "role" || claim.Type == "roles")
            && (string.Equals(claim.Value, "Author", StringComparison.OrdinalIgnoreCase)
                || string.Equals(claim.Value, "Admin", StringComparison.OrdinalIgnoreCase)));
}

/// <summary>Refresh token payload for non-browser API clients.</summary>
public sealed record RefreshTokenRequest(string RefreshToken);

/// <summary>Google ID token produced by Google Sign-In on the frontend.</summary>
public sealed record GoogleIdTokenLoginRequest(string IdToken);
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Email, string Token, string NewPassword);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record UpdateProfileRequest(string? DisplayName, string? Bio, string? AvatarUrl);

/// <summary>Public authentication response; the refresh token is only sent as an HttpOnly cookie.</summary>
public sealed record AuthSessionResponseDto(
    string AccessToken,
    DateTime AccessTokenExpiry,
    UserDto User,
    IReadOnlyList<string> Roles);
