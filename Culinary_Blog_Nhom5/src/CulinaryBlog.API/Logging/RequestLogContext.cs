using System.Security.Claims;

namespace CulinaryBlog.API.Logging;

public static class RequestLogContext
{
    public const string CorrelationHeader = "X-Correlation-ID";
    public const string FailedItem = "Observability.RequestFailed";
    public static bool IsValidCorrelationId(string? value) => value is { Length: > 0 and <= 128 }
        && value.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.');
    public static string? UserId(HttpContext context) => context.User.Identity?.IsAuthenticated == true
        ? context.User.FindFirstValue(ClaimTypes.NameIdentifier) : null;
}
