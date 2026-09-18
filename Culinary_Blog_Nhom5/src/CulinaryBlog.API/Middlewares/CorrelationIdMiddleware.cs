using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace CulinaryBlog.API.Middlewares;

public class CorrelationIdMiddleware
{
    private const string CorrelationIdHeaderName = "X-Correlation-ID";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Headers.TryGetValue(CorrelationIdHeaderName, out var correlationId) || string.IsNullOrWhiteSpace(correlationId))
        {
            correlationId = Guid.NewGuid().ToString();
        }

        context.Items[CorrelationIdHeaderName] = correlationId.ToString();
        context.Response.Headers[CorrelationIdHeaderName] = correlationId.ToString();

        await _next(context);
    }
}
