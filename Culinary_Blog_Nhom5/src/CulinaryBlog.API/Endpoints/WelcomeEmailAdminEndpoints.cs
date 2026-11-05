using System.Security.Claims;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Common.Models;

namespace CulinaryBlog.API.Endpoints;

public sealed record ReconcileWelcomeEmailRequest(string Outcome, string EvidenceReference);

public static class WelcomeEmailAdminEndpoints
{
    public static IEndpointRouteBuilder MapWelcomeEmailAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/admin/welcome-emails").WithTags("Admin").RequireAuthorization("AdminOnly");
        group.MapGet("/reconciliation", async (int? page, int? pageSize, IWelcomeEmailReconciliation service, CancellationToken ct) =>
            Results.Ok(await service.ListAsync(page ?? 1, pageSize ?? 20, ct)))
            .WithName("AdminListWelcomeEmailReview").WithSummary("Danh sách email có kết quả gửi chưa rõ, chờ đối soát")
            .Produces<PagedResult<WelcomeEmailReviewItem>>()
            .ProducesProblem(StatusCodes.Status401Unauthorized).ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status422UnprocessableEntity);
        group.MapPost("/{id:guid}/reconcile", async (Guid id, ReconcileWelcomeEmailRequest request,
            IWelcomeEmailReconciliation service, HttpContext context, CancellationToken ct) =>
            Results.Ok(new { data = await service.ResolveAsync(id, request.Outcome, request.EvidenceReference,
                context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "", ct) }))
            .WithName("AdminReconcileWelcomeEmail").WithSummary("Đối soát Accepted/NotAccepted bằng mã bằng chứng đã kiểm tra")
            .Produces(StatusCodes.Status200OK).ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict).ProducesProblem(StatusCodes.Status422UnprocessableEntity);
        return app;
    }
}
