using CulinaryBlog.API.Responses;
using System.Globalization;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace CulinaryBlog.API.Endpoints;

public static class RecipeApiConfiguration
{
    public static IServiceCollection AddRecipeApiConfiguration(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            foreach (var (name, limit) in new[] { ("recipe-read", 100), ("recipe-write", 30) })
                options.AddPolicy(name, context => RateLimitPartition.GetFixedWindowLimiter(
                    context.User.FindFirstValue(ClaimTypes.NameIdentifier)
                        ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = limit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0
                    }));
            options.OnRejected = async (context, ct) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                    context.HttpContext.Response.Headers.RetryAfter =
                        Math.Ceiling(retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
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
