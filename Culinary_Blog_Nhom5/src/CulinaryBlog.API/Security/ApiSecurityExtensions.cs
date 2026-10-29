using CulinaryBlog.API.Responses;
using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace CulinaryBlog.API.Security;

public static class ApiSecurityExtensions
{
    public static IServiceCollection AddApiSecurity(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                context.Request.Path.StartsWithSegments("/api")
                    ? RateLimitPartition.GetFixedWindowLimiter("api:" + ClientIp(context), _ => Window(100))
                    : RateLimitPartition.GetNoLimiter("non-api"));
            options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(ClientIp(context), _ => Window(10)));
            options.AddPolicy("upload", context => RateLimitPartition.GetFixedWindowLimiter(ClientIp(context), _ => Window(5)));
            options.OnRejected = async (context, cancellationToken) =>
            {
                var seconds = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
                    ? Math.Max(1, Math.Ceiling(retryAfter.TotalSeconds)) : 60;
                context.HttpContext.Response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
                await ApiProblemResponses.WriteAsync(
                    context.HttpContext,
                    StatusCodes.Status429TooManyRequests,
                    "Quá nhiều yêu cầu.",
                    "Vui lòng chờ trước khi thử lại.",
                    "https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.9");
            };
        });
        return services;
    }

    private static FixedWindowRateLimiterOptions Window(int permits) => new()
    {
        PermitLimit = permits, Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true
    };

    private static string ClientIp(HttpContext context)
    {
        var ip = context.Connection.RemoteIpAddress;
        return (ip?.IsIPv4MappedToIPv6 == true ? ip.MapToIPv4() : ip)?.ToString() ?? "unknown";
    }
}
