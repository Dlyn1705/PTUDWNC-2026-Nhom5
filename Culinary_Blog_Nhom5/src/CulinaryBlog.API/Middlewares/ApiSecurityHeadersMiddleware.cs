namespace CulinaryBlog.API.Middlewares;

public sealed class ApiSecurityHeadersMiddleware(RequestDelegate next, IWebHostEnvironment environment)
{
    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers.XContentTypeOptions = "nosniff";
            headers.XFrameOptions = "DENY";
            headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";
            if (!environment.IsDevelopment() && context.Request.IsHttps)
                headers.StrictTransportSecurity = "max-age=31536000";
            // Scalar's development-only UI loads its own inline bootstrap and CDN bundle.
            var documentation = environment.IsDevelopment() && context.Request.Path.StartsWithSegments("/scalar");
            headers.ContentSecurityPolicy = documentation
                ? "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"
                : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
            return Task.CompletedTask;
        });
        return next(context);
    }
}
