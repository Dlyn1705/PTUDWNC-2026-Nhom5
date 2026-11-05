using System.Net.Http.Json;
using CulinaryBlog.Application.Contracts;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services;

/// <summary>
/// Calls the frontend's authenticated on-demand ISR endpoint after a committed
/// public-content mutation. Configuration is optional so local/API-only
/// deployments continue to rely on TTLs and Redis invalidation.
/// </summary>
public sealed class FrontendRevalidationClient(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<FrontendRevalidationClient> logger) : IFrontendRevalidationClient
{
    public async Task RevalidateAsync(
        IReadOnlyCollection<string> tags,
        IReadOnlyCollection<string> paths,
        CancellationToken cancellationToken = default)
    {
        var endpoint = configuration["SeoRevalidation:Url"]
            ?? configuration["SEO_REVALIDATION_URL"];
        var secret = configuration["SeoRevalidation:Secret"]
            ?? configuration["SEO_REVALIDATION_SECRET"];
        if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(secret)) return;

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
            request.Headers.Add("x-revalidation-secret", secret);
            request.Content = JsonContent.Create(new { tags, paths });
            using var response = await httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "Frontend ISR revalidation returned HTTP {StatusCode} for {Endpoint}",
                    (int)response.StatusCode,
                    endpoint);
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(
                exception,
                "Frontend ISR revalidation failed for {Endpoint}; TTL remains the fallback",
                endpoint);
        }
    }
}
