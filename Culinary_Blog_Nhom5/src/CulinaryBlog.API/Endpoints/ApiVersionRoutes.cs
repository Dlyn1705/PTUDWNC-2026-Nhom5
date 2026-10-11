using Asp.Versioning;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;

namespace CulinaryBlog.API.Endpoints;

public static class ApiVersionRoutes
{
    public static RouteGroupBuilder MapApiV1Group(this IEndpointRouteBuilder endpoints, string route)
    {
        var version = new ApiVersion(1, 0);
        var versionSet = endpoints.NewApiVersionSet()
            .HasApiVersion(version)
            .ReportApiVersions()
            .Build();

        return endpoints.MapGroup($"/api/v{{version:apiVersion}}/{route}")
            .WithApiVersionSet(versionSet)
            .MapToApiVersion(version);
    }
}
