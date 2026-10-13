using CulinaryBlog.API.Logging;
using Serilog.Context;

namespace CulinaryBlog.API.Middlewares;

public class CorrelationIdMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var values = context.Request.Headers[RequestLogContext.CorrelationHeader];
        var id = values.Count == 1 && RequestLogContext.IsValidCorrelationId(values[0])
            ? values[0]! : Guid.NewGuid().ToString();
        context.Items[RequestLogContext.CorrelationHeader] = id;
        context.Response.Headers[RequestLogContext.CorrelationHeader] = id;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[RequestLogContext.CorrelationHeader] = id;
            return Task.CompletedTask;
        });
        using (LogContext.PushProperty("CorrelationId", id))
        using (LogContext.PushProperty("RequestId", context.TraceIdentifier))
            await next(context);
    }
}
