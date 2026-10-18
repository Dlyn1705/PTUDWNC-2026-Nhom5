using Hangfire.Dashboard;

namespace CulinaryBlog.API.Authorization;

/// <summary>
/// Restricts the Hangfire dashboard to authenticated administrators.
/// </summary>
public sealed class AdminHangfireDashboardAuthorizationFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var httpContext = context.GetHttpContext();
        return httpContext.User.Identity?.IsAuthenticated == true
            && httpContext.User.IsInRole("Admin");
    }
}
