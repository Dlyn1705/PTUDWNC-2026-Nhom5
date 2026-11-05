using CulinaryBlog.Application.Common.Models;

namespace CulinaryBlog.Application.Contracts;

public sealed record WelcomeEmailReviewItem(Guid Id, string MessageId, string UserId, int AttemptCount,
    DateTime CreatedAt, DateTime? SubmissionStartedAt, string? ErrorCode);
public sealed record WelcomeEmailResolution(Guid DeliveryId, string Status, int AttemptCount, Guid AuditId);

public interface IWelcomeEmailReconciliation
{
    Task<PagedResult<WelcomeEmailReviewItem>> ListAsync(int page, int pageSize, CancellationToken ct);
    Task<WelcomeEmailResolution> ResolveAsync(Guid id, string outcome, string evidenceReference, string actorId, CancellationToken ct);
}
