using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.API.Middlewares;

public sealed class RequestAuditMiddleware(
    RequestDelegate next,
    ILogger<RequestAuditMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (!HttpMethods.IsPost(context.Request.Method)
            && !HttpMethods.IsPut(context.Request.Method)
            && !HttpMethods.IsPatch(context.Request.Method)
            && !HttpMethods.IsDelete(context.Request.Method))
        {
            await next(context);
            return;
        }

        var occurredAtUtc = DateTimeOffset.UtcNow;
        try
        {
            await next(context);
        }
        finally
        {
            var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? context.User.FindFirstValue("sub");

            logger.LogInformation(
                "Audit write request: {Method} {Path}; UserId={UserId}; StatusCode={StatusCode}; OccurredAtUtc={OccurredAtUtc}",
                context.Request.Method,
                context.Request.Path.Value,
                userId,
                context.Response.StatusCode,
                occurredAtUtc);
        }
    }
}