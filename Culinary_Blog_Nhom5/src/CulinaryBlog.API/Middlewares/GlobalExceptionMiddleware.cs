using System;
using CulinaryBlog.API.Logging;
using CulinaryBlog.Application.Common.Behaviors;
using System.Text.Json;
using System.Threading.Tasks;
using CulinaryBlog.Domain.Exceptions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.API.Middlewares;

public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex) when (context.RequestAborted.IsCancellationRequested
                                   && ex is OperationCanceledException or IOException)
        {
            // The completion event records Canceled. Do not write to an aborted response.
            if (!context.Response.HasStarted) context.Response.StatusCode = 499;
        }
        catch (Exception ex)
        {
            context.Items[RequestLogContext.FailedItem] = true;
            using var scope = _logger.BeginScope(new Dictionary<string, object?>
            {
                ["UserId"] = RequestLogContext.UserId(context),
                ["EventType"] = StructuredLoggingOptions.IsExpected(ex) ? "RequestRejected" : "UnhandledException"
            });
            if (StructuredLoggingOptions.IsExpected(ex))
                _logger.LogWarning("Request rejected with {ExceptionType}", ex.GetType().Name);
            else
                _logger.LogError(ex, "Unhandled request exception");
            if (context.Response.HasStarted) throw;
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/problem+json";

        string correlationId = context.Items.TryGetValue(RequestLogContext.CorrelationHeader, out var cid)
            ? cid?.ToString() ?? string.Empty
            : string.Empty;

        var problemDetails = new ProblemDetails
        {
            Instance = context.Request.Path
        };

        if (!string.IsNullOrEmpty(correlationId))
        {
            problemDetails.Extensions["correlationId"] = correlationId;
        }

        switch (exception)
        {
            case ValidationException valEx:
                context.Response.StatusCode = StatusCodes.Status422UnprocessableEntity;
                problemDetails.Status = StatusCodes.Status422UnprocessableEntity;
                problemDetails.Title = "Dữ liệu đầu vào không hợp lệ.";
                problemDetails.Type = "https://tools.ietf.org/html/rfc4918#section-11.2";
                problemDetails.Detail = valEx.Message;
                problemDetails.Extensions["errors"] = valEx.Errors;
                break;

            case NotFoundException notFoundEx:
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                problemDetails.Status = StatusCodes.Status404NotFound;
                problemDetails.Title = "Không tìm thấy tài nguyên.";
                problemDetails.Type = "https://tools.ietf.org/html/rfc7231#section-6.5.4";
                problemDetails.Detail = notFoundEx.Message;
                break;

            case ConflictException conflictEx:
                context.Response.StatusCode = StatusCodes.Status409Conflict;
                problemDetails.Status = StatusCodes.Status409Conflict;
                problemDetails.Title = "Xung đột dữ liệu.";
                problemDetails.Type = "https://tools.ietf.org/html/rfc7231#section-6.5.8";
                problemDetails.Detail = conflictEx.Message;
                problemDetails.Extensions["code"] = conflictEx.Code;
                break;

            case ExternalServiceException externalServiceEx:
                context.Response.StatusCode = StatusCodes.Status502BadGateway;
                problemDetails.Status = StatusCodes.Status502BadGateway;
                problemDetails.Title = "Dịch vụ xác thực bên ngoài không khả dụng.";
                problemDetails.Detail = externalServiceEx.Message;
                break;

            case ForbiddenException forbiddenEx:
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                problemDetails.Status = StatusCodes.Status403Forbidden;
                problemDetails.Title = "Không có quyền truy cập.";
                problemDetails.Type = "https://tools.ietf.org/html/rfc7231#section-6.5.3";
                problemDetails.Detail = forbiddenEx.Message;
                break;

            case UnauthorizedAccessException unauthorizedEx:
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                problemDetails.Status = StatusCodes.Status401Unauthorized;
                problemDetails.Title = "Yêu cầu xác thực.";
                problemDetails.Type = "https://tools.ietf.org/html/rfc7235#section-3.1";
                problemDetails.Detail = unauthorizedEx.Message;
                break;

            case LockedException lockedEx:
                context.Response.StatusCode = StatusCodes.Status423Locked;
                problemDetails.Status = StatusCodes.Status423Locked;
                problemDetails.Title = "Tài khoản bị tạm khóa.";
                problemDetails.Type = "https://datatracker.ietf.org/doc/html/rfc4918#section-11.3";
                problemDetails.Detail = lockedEx.Message;
                break;

            case DbUpdateConcurrencyException:
                context.Response.StatusCode = StatusCodes.Status409Conflict;
                problemDetails.Status = StatusCodes.Status409Conflict;
                problemDetails.Title = "Dữ liệu đã được thay đổi bởi một yêu cầu khác.";
                problemDetails.Type = "https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.10";
                problemDetails.Detail = "Tải lại dữ liệu mới nhất rồi thử lại.";
                break;

           default:
                context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                problemDetails.Status = StatusCodes.Status500InternalServerError;
                problemDetails.Title = "Lỗi máy chủ nội bộ.";
                problemDetails.Type = "https://tools.ietf.org/html/rfc7231#section-6.6.1";
                problemDetails.Detail = "Lỗi máy chủ nội bộ. Hãy cung cấp correlation ID cho bộ phận hỗ trợ.";
                break;
            }

        var json = JsonSerializer.Serialize(problemDetails, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true
        });

        await context.Response.WriteAsync(json);
    }
}
