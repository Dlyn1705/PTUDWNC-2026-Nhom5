using System.Text.RegularExpressions;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Services.Email;

public sealed class WelcomeEmailReconciliation(IServiceScopeFactory scopes, TimeProvider clock,
    ILogger<WelcomeEmailReconciliation> logger) : IWelcomeEmailReconciliation
{
    public async Task<PagedResult<WelcomeEmailReviewItem>> ListAsync(int page, int pageSize, CancellationToken ct)
    {
        if (page < 1) throw new ValidationException("page", "page phải lớn hơn 0.");
        if (pageSize is < 1 or > 50) throw new ValidationException("pageSize", "pageSize phải từ 1 đến 50.");
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var query = db.WelcomeEmailDeliveries.AsNoTracking().Where(x => x.Status == WelcomeEmailStatus.NeedsReview);
        var total = await query.CountAsync(ct);
        var offset = ((long)page - 1) * pageSize;
        if (offset > int.MaxValue) return new([], total, page, pageSize);
        var rows = await query.OrderBy(x => x.UpdatedAt).ThenBy(x => x.Id).Skip((int)offset).Take(pageSize).ToArrayAsync(ct);
        return new(rows.Select(x => new WelcomeEmailReviewItem(x.Id, $"welcome-{x.Id:N}@culinary.invalid", x.UserId,
            x.AttemptCount, x.CreatedAt, x.SubmissionStartedAt, x.LastErrorCode)).ToArray(), total, page, pageSize);
    }

    public async Task<WelcomeEmailResolution> ResolveAsync(Guid id, string outcome, string evidenceReference, string actorId, CancellationToken ct)
    {
        if (outcome is not ("Accepted" or "NotAccepted")) throw new ValidationException("outcome", "Chỉ nhận Accepted hoặc NotAccepted.");
        if (string.IsNullOrEmpty(evidenceReference) || !Regex.IsMatch(evidenceReference, @"\A[A-Za-z0-9][A-Za-z0-9._-]{0,99}\z"))
            throw new ValidationException("evidenceReference", "Cần mã biên nhận hoặc hồ sơ đối soát (tối đa 100 ký tự, không nhập nội dung thư/secret).");
        if (string.IsNullOrEmpty(actorId) || actorId.Length > 450) throw new ForbiddenException();
        using var outer = scopes.CreateScope();
        var strategyDb = outer.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var auditId = Guid.NewGuid();
        return await strategyDb.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var delivery = await db.WelcomeEmailDeliveries.FromSqlInterpolated(
                $"SELECT * FROM \"WelcomeEmailDeliveries\" WHERE \"Id\" = {id} FOR UPDATE").SingleOrDefaultAsync(ct)
                ?? throw new NotFoundException("Không tìm thấy email cần đối soát.");
            var previous = await db.WelcomeEmailReconciliations.AsNoTracking().SingleOrDefaultAsync(x => x.DeliveryId == id && x.EvidenceReference == evidenceReference, ct);
            if (previous is not null)
            {
                if (previous.Outcome != outcome) throw new ConflictException("Mã bằng chứng đã được dùng cho kết quả khác.");
                return new WelcomeEmailResolution(id, delivery.Status.ToString(), delivery.AttemptCount, previous.Id);
            }
            var now = clock.GetUtcNow().UtcDateTime;
            if (delivery.Status != WelcomeEmailStatus.NeedsReview || delivery.LeaseExpiresAt > now)
                throw new ConflictException("Email chưa ở trạng thái cho phép đối soát hoặc worker còn lease.");
            if (outcome == "Accepted") { delivery.Status = WelcomeEmailStatus.Sent; delivery.SentAt = now; }
            else
            {
                delivery.Status = delivery.AttemptCount >= WelcomeEmailStore.MaximumAttempts ? WelcomeEmailStatus.Failed : WelcomeEmailStatus.Pending;
                delivery.SubmissionStartedAt = null; delivery.NextAttemptAt = now; delivery.HangfireJobId = null;
            }
            delivery.LastErrorCode = outcome == "Accepted" ? "ReconciledAccepted" : "ReconciledNotAccepted";
            delivery.LeaseToken = null; delivery.LeaseExpiresAt = null; delivery.UpdatedAt = now;
            db.WelcomeEmailReconciliations.Add(new WelcomeEmailReconciliationRecord { Id = auditId, DeliveryId = id,
                Outcome = outcome, ActorId = actorId, EvidenceReference = evidenceReference, CreatedAt = now, AttemptCount = delivery.AttemptCount });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            logger.LogInformation("Welcome email {EmailMessageId} reconciled as {Outcome} by {UserId} with audit {AuditId} and {CorrelationId}",
                id, outcome, actorId, auditId, $"job-welcome-{id:N}");
            return new WelcomeEmailResolution(id, delivery.Status.ToString(), delivery.AttemptCount, auditId);
        });
    }
}
