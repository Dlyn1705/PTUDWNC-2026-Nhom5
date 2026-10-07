using CulinaryBlog.API.Logging;
using Serilog.Context;

namespace CulinaryBlog.API.Middlewares;

public sealed class UserLogContextMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        using (LogContext.PushProperty("UserId", RequestLogContext.UserId(context)))
            await next(context);
    }
}
