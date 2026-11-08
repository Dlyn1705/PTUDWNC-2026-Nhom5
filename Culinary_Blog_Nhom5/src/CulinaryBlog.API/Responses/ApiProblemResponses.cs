using CulinaryBlog.API.Middlewares;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;

namespace CulinaryBlog.API.Responses;

/// <summary>
/// Creates RFC 7807 responses consistently for middleware-owned failures.
/// </summary>
public static class ApiProblemResponses
{
    public static ProblemDetails Create(
        HttpContext context,
        int status,
        string title,
        string detail,
        string? type = null,
        IReadOnlyDictionary<string, object?>? extensions = null)
    {
        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Type = type ?? TypeForStatus(status),
            Instance = context.Request.Path
        };
        problem.Extensions["errors"] = new Dictionary<string, string[]>();

        if (extensions is not null)
        {
            foreach (var (key, value) in extensions)
            {
                problem.Extensions[key] = value;
            }
        }

        // The response header is useful to transports that do not parse JSON;
        // the body makes the same identifier available to normal API clients.
        problem.Extensions["correlationId"] = CorrelationIdMiddleware.EnsureCorrelationId(context);
        return problem;
    }

    public static Task WriteAsync(
        HttpContext context,
        int status,
        string title,
        string detail,
        string? type = null,
        IReadOnlyDictionary<string, object?>? extensions = null)
    {
        var problem = Create(context, status, title, detail, type, extensions);
        return Results.Json(
                problem,
                contentType: "application/problem+json",
                statusCode: status)
            .ExecuteAsync(context);
    }

    /// <summary>Fills framework-generated API failures that have no response body.</summary>
    public static Task WriteStatusAsync(HttpContext context)
    {
        var status = context.Response.StatusCode;
        var title = ReasonPhrases.GetReasonPhrase(status);
        var detail = status >= 500
            ? "Máy chủ đang gặp sự cố. Hãy cung cấp correlation ID cho bộ phận hỗ trợ."
            : "Yêu cầu không thể hoàn tất.";
        return WriteAsync(context, status, title, detail);
    }

    private static string TypeForStatus(int status) => status switch
    {
        StatusCodes.Status400BadRequest => "https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.1",
        StatusCodes.Status401Unauthorized => "https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.2",
        StatusCodes.Status403Forbidden => "https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.4",
        StatusCodes.Status404NotFound => "https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.5",
        StatusCodes.Status409Conflict => "https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.10",
        StatusCodes.Status422UnprocessableEntity => "https://datatracker.ietf.org/doc/html/rfc4918#section-11.2",
        StatusCodes.Status429TooManyRequests => "https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.9",
        StatusCodes.Status500InternalServerError => "https://datatracker.ietf.org/doc/html/rfc9110#section-15.6.1",
        StatusCodes.Status502BadGateway => "https://datatracker.ietf.org/doc/html/rfc9110#section-15.6.3",
        StatusCodes.Status503ServiceUnavailable => "https://datatracker.ietf.org/doc/html/rfc9110#section-15.6.4",
        _ => "about:blank"
    };
}
