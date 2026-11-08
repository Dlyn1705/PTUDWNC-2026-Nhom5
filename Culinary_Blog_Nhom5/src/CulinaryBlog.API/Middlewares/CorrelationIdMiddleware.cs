using CulinaryBlog.API.Logging;
using Serilog.Context;

namespace CulinaryBlog.API.Middlewares;

public class CorrelationIdMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var id = EnsureCorrelationId(context);
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[RequestLogContext.CorrelationHeader] = id;
            return Task.CompletedTask;
        });
        using (LogContext.PushProperty("CorrelationId", id))
        using (LogContext.PushProperty("RequestId", context.TraceIdentifier))
            await next(context);
    }

    /// <summary>
    /// Provides correlation for failures generated outside the normal request
    /// pipeline too, such as rate-limit and authentication handlers.
    /// </summary>
    public static string EnsureCorrelationId(HttpContext context)
    {
        if (context.Items.TryGetValue(RequestLogContext.CorrelationHeader, out var existing)
            && existing is string existingId
            && RequestLogContext.IsValidCorrelationId(existingId))
        {
            if (!context.Response.HasStarted)
                context.Response.Headers[RequestLogContext.CorrelationHeader] = existingId;
            return existingId;
        }

        var values = context.Request.Headers[RequestLogContext.CorrelationHeader];
        var id = values.Count == 1 && RequestLogContext.IsValidCorrelationId(values[0])
            ? values[0]!
            : Guid.NewGuid().ToString();
        context.Items[RequestLogContext.CorrelationHeader] = id;
        if (!context.Response.HasStarted)
            context.Response.Headers[RequestLogContext.CorrelationHeader] = id;
        return id;
    }
}
