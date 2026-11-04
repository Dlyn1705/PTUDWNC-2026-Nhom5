using CulinaryBlog.Domain.Exceptions;

namespace CulinaryBlog.API.Security;

/// <summary>Reject cross-site browser requests before a refresh cookie is consumed.</summary>
public static class RefreshCookieOriginGuard
{
    public static void EnsureAllowed(HttpContext context, IConfiguration configuration)
    {
        if (!context.Request.Cookies.ContainsKey("culinary_refresh_token")) return;

        if (string.Equals(context.Request.Headers["Sec-Fetch-Site"], "cross-site", StringComparison.OrdinalIgnoreCase))
            throw new ForbiddenException("Cross-site refresh cookie request is not allowed.");

        var origin = context.Request.Headers.Origin.ToString();
        if (string.IsNullOrEmpty(origin))
            throw new ForbiddenException("Refresh cookie request requires a trusted Origin.");
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)
            || !string.Equals(origin, uri.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase))
            throw new ForbiddenException("Refresh cookie origin is not allowed.");

        var ownOrigin = $"{context.Request.Scheme}://{context.Request.Host}";
        var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        if (!string.Equals(origin, ownOrigin, StringComparison.OrdinalIgnoreCase)
            && !allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
            throw new ForbiddenException("Refresh cookie origin is not allowed.");
    }
}
