using CulinaryBlog.API.Responses;
using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace CulinaryBlog.API.Endpoints;

public static class RecipeApiConfiguration
{
    public static IServiceCollection AddRecipeApiConfiguration(this IServiceCollection services, bool capacityMode = false)
    {
        services.AddRateLimiter(options =>
        {
            foreach (var (name, limit) in new[] { ("recipe-read", 100), ("recipe-write", 30) })
                options.AddPolicy(name, context => capacityMode ? RateLimitPartition.GetNoLimiter("capacity") : RateLimitPartition.GetFixedWindowLimiter(
                    (context.Connection.RemoteIpAddress?.IsIPv4MappedToIPv6 == true
                        ? context.Connection.RemoteIpAddress.MapToIPv4()
                        : context.Connection.RemoteIpAddress)?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = limit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0
                    }));
            options.OnRejected = async (context, ct) =>
            {
                var seconds = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
                    ? Math.Max(1, Math.Ceiling(retryAfter.TotalSeconds)) : 60;
                context.HttpContext.Response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
                await ApiProblemResponses.WriteAsync(
                    context.HttpContext,
                    StatusCodes.Status429TooManyRequests,
                    "Too many requests.",
                    "Please wait before trying again.",
                    "https://datatracker.ietf.org/doc/html/rfc9110#section-15.5.9");
            };
        });
        services.Configure<OpenApiOptions>("v1", options =>
        {
            options.AddDocumentTransformer((document, context, ct) =>
            {
                document.Info.Title = "Culinary Blog API";
                document.Info.Description = "URL versioning: /api/v1. Breaking changes require a new URL version.";
                document.Components ??= new OpenApiComponents();
                document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
                document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
                {
                    Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT"
                };
                return Task.CompletedTask;
            });
            options.AddOperationTransformer((operation, context, ct) =>
            {
                var metadata = context.Description.ActionDescriptor.EndpointMetadata;
                if (metadata.OfType<IAuthorizeData>().Any() && !metadata.OfType<IAllowAnonymous>().Any())
                {
                    operation.Security ??= [];
                    operation.Security.Add(new OpenApiSecurityRequirement
                    {
                        [new OpenApiSecuritySchemeReference("Bearer", context.Document)] = []
                    });
                }
                return Task.CompletedTask;
            });
        });
        return services;
    }
}
