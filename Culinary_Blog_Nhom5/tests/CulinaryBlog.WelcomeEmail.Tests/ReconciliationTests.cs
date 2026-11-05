using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Services.Email;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xunit;
using Xunit.Abstractions;

namespace CulinaryBlog.WelcomeEmail.Tests;

public sealed class ReconciliationTests(ITestOutputHelper output)
{
    [Fact]
    public async Task Retention_preserves_unresolved_delivery_and_audit_across_restart_but_cleans_expired_resolved_audit()
    {
        var transport = new AmbiguousEmail();
        await using var app = await TestApp.CreateAsync(transport: transport);
        var unresolved = await app.RegisterAsync();
        await Assert.ThrowsAsync<WelcomeEmailOutcomeUnknownException>(() => app.Get<WelcomeEmailJob>().SendAsync(unresolved.Id, default));
        var resolved = await app.RegisterAsync();
        await Assert.ThrowsAsync<WelcomeEmailOutcomeUnknownException>(() => app.Get<WelcomeEmailJob>().SendAsync(resolved.Id, default));
        await app.Get<IWelcomeEmailReconciliation>().ResolveAsync(resolved.Id, "Accepted", "RETENTION-RECEIPT", "admin-test", default);
        var retainedAudit = Guid.NewGuid();
        var recentOrphan = Guid.NewGuid();
        await app.Db(async db =>
        {
            var old = app.Clock.GetUtcNow().UtcDateTime.AddDays(-40);
            foreach (var row in await db.WelcomeEmailDeliveries.ToArrayAsync()) row.UpdatedAt = old;
            foreach (var row in await db.WelcomeEmailReconciliations.ToArrayAsync()) row.CreatedAt = old;
            db.WelcomeEmailReconciliations.Add(new WelcomeEmailReconciliationRecord {
                Id = retainedAudit, DeliveryId = unresolved.Id, Outcome = "NotAccepted", ActorId = "admin-test",
                EvidenceReference = "PRIOR-INCIDENT", CreatedAt = old, AttemptCount = 1 });
            db.WelcomeEmailReconciliations.Add(new WelcomeEmailReconciliationRecord {
                Id = recentOrphan, DeliveryId = Guid.NewGuid(), Outcome = "Accepted", ActorId = "admin-test",
                EvidenceReference = "RECENT-RECEIPT", CreatedAt = app.Clock.GetUtcNow().UtcDateTime, AttemptCount = 1 });
            return await db.SaveChangesAsync();
        });
        await app.RestartAsync();
        await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
        await app.Get<WelcomeEmailJob>().SendAsync(unresolved.Id, default);
        var held = await app.Delivery(unresolved.Id);
        Assert.Equal(WelcomeEmailStatus.NeedsReview, held.Status);
        Assert.Equal(unresolved.RecipientEmail, held.RecipientEmail);
        Assert.Equal(1, held.AttemptCount);
        Assert.NotNull(held.SubmissionStartedAt);
        Assert.False(await app.Db(db => db.WelcomeEmailDeliveries.AnyAsync(x => x.Id == resolved.Id)));
        var audits = await app.Db(db => db.WelcomeEmailReconciliations.Select(x => x.Id).ToArrayAsync());
        Assert.Equal(2, audits.Length);
        Assert.Contains(retainedAudit, audits);
        Assert.Contains(recentOrphan, audits);
        app.Clock.Advance(41 * 24 * 60 * 60);
        await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
        Assert.Equal(retainedAudit, await app.Db(db => db.WelcomeEmailReconciliations.Select(x => x.Id).SingleAsync()));
        Assert.Equal(WelcomeEmailStatus.NeedsReview, (await app.Delivery(unresolved.Id)).Status);
        Assert.Equal(2, transport.Calls);
        output.WriteLine("DURABILITY_EVIDENCE " + JsonSerializer.Serialize(new {
            scenario = "smtp-review-retention-preserves-unresolved-audit", businessKey = unresolved.Id,
            correlationId = $"job-welcome-{unresolved.Id:N}", status = held.Status.ToString(),
            transportCalls = transport.Calls, unresolvedAuditRetained = true, expiredOrphanAuditRemoved = true }));
    }

    [Fact]
    public async Task Migration_quarantines_legacy_attempts_but_keeps_new_pending_intents_and_live_lease()
    {
        await using var app = await TestApp.CreateAsync();
        var processing = Guid.NewGuid(); var retry = Guid.NewGuid(); var fresh = Guid.NewGuid();
        var now = app.Clock.GetUtcNow().UtcDateTime;
        // PostgreSQL timestamps retain microseconds, not .NET's 100ns tick remainder.
        var lease = new DateTime(now.AddMinutes(3).Ticks / 10 * 10, DateTimeKind.Utc);
        await app.Db(async db =>
        {
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync("20261103144352_BoundOriginalCleanupRetryBudget");
            foreach (var (id, status, attempts) in new[] { (processing, "Processing", 1), (retry, "Pending", 1), (fresh, "Pending", 0) })
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO "WelcomeEmailDeliveries" ("Id", "UserId", "MessageType", "RecipientEmail", "TemplateVersion", "Status", "AttemptCount", "CreatedAt", "UpdatedAt", "NextAttemptAt", "LeaseExpiresAt")
                    VALUES ({id}, {id.ToString()}, 'Welcome', 'legacy@welcome.test', 1, {status}, {attempts}, {now}, {now}, {now}, {lease});
                    """);
            await migrator.MigrateAsync();
            return 0;
        });
        Assert.Equal(WelcomeEmailStatus.NeedsReview, (await app.Delivery(processing)).Status);
        Assert.Equal(WelcomeEmailStatus.NeedsReview, (await app.Delivery(retry)).Status);
        Assert.Equal(WelcomeEmailStatus.Pending, (await app.Delivery(fresh)).Status);
        Assert.Equal(lease, (await app.Delivery(processing)).LeaseExpiresAt);
        await Assert.ThrowsAsync<ConflictException>(() => app.Get<IWelcomeEmailReconciliation>().ResolveAsync(processing,
            "Accepted", "LEGACY-RECEIPT-1", "admin-test", default));
        await app.Db(async db =>
        {
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync("20261103144352_BoundOriginalCleanupRetryBudget");
            var statuses = await db.Database.SqlQueryRaw<string>("SELECT \"Status\" AS \"Value\" FROM \"WelcomeEmailDeliveries\" WHERE \"Status\" = 'Failed'").ToListAsync();
            Assert.Equal(2, statuses.Count);
            await migrator.MigrateAsync();
            return 0;
        });
        Assert.Equal(WelcomeEmailStatus.NeedsReview, (await app.Delivery(processing)).Status);
        Assert.Equal(1, (await app.Delivery(processing)).AttemptCount);
    }

    private sealed class AmbiguousEmail : IEmailService
    {
        public int Calls;
        public bool Unknown = true;
        public Task SendWelcomeEmailAsync(string address, string name, CancellationToken ct = default)
        {
            Interlocked.Increment(ref Calls);
            if (Unknown) throw new IOException("private transport response lost");
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task Crash_after_submission_checkpoint_survives_restart_without_dispatch_or_send()
    {
        var transport = new RecordingEmail();
        await using var app = await TestApp.CreateAsync(transport: transport);
        var item = await app.RegisterAsync();
        var claim = (await app.Get<WelcomeEmailStore>().ClaimAsync(item.Id, default))!;
        await app.Get<WelcomeEmailStore>().BeginSubmissionAsync(claim, default);
        app.Clock.Advance(app.Options.LeaseSeconds + 1);
        await app.RestartAsync();
        await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
        await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        var held = await app.Delivery(item.Id);
        Assert.Equal(WelcomeEmailStatus.NeedsReview, held.Status);
        Assert.Equal(1, held.AttemptCount); Assert.NotNull(held.SubmissionStartedAt);
        Assert.Null(held.HangfireJobId); Assert.Null(held.SentAt); Assert.Equal(0, transport.Calls);
        await Assert.ThrowsAsync<InvalidOperationException>(() => app.Get<WelcomeEmailStore>().CompleteAsync(claim, default));
        output.WriteLine("DURABILITY_EVIDENCE " + JsonSerializer.Serialize(new { scenario = "smtp-checkpoint-crash-no-resend", businessKey = item.Id,
            correlationId = $"job-welcome-{item.Id:N}", status = held.Status.ToString(), transportCalls = transport.Calls }));
    }

    [Fact]
    public async Task Unknown_result_is_held_until_not_accepted_evidence_and_duplicate_resolution_is_idempotent()
    {
        var transport = new AmbiguousEmail();
        await using var app = await TestApp.CreateAsync(transport: transport);
        var item = await app.RegisterAsync();
        await Assert.ThrowsAsync<WelcomeEmailOutcomeUnknownException>(() => app.Get<WelcomeEmailJob>().SendAsync(item.Id, default));
        Assert.Equal(WelcomeEmailStatus.NeedsReview, (await app.Delivery(item.Id)).Status);
        app.Clock.Advance(1000); await app.RestartAsync();
        await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
        await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        Assert.Equal(1, transport.Calls);
        var decisions = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => app.Get<IWelcomeEmailReconciliation>()
            .ResolveAsync(item.Id, "NotAccepted", "INC-NOT-ACCEPTED-1", "admin-test", default)));
        Assert.Single(decisions.Select(x => x.AuditId).Distinct());
        Assert.Equal(1, await app.Db(db => db.WelcomeEmailReconciliations.CountAsync()));
        Assert.Equal(1, (await app.Delivery(item.Id)).AttemptCount);
        Assert.Null((await app.Delivery(item.Id)).SubmissionStartedAt);
        transport.Unknown = false;
        await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        Assert.Equal(WelcomeEmailStatus.Sent, (await app.Delivery(item.Id)).Status);
        Assert.Equal(2, transport.Calls);
        await app.Get<IWelcomeEmailReconciliation>().ResolveAsync(item.Id, "NotAccepted", "INC-NOT-ACCEPTED-1", "admin-test", default);
        await Assert.ThrowsAsync<ConflictException>(() => app.Get<IWelcomeEmailReconciliation>().ResolveAsync(item.Id,
            "Accepted", "INC-NOT-ACCEPTED-1", "admin-test", default));
        Assert.Equal(2, transport.Calls);
    }

    [Fact]
    public async Task Audit_insert_failure_rolls_back_resolution_and_can_be_retried_after_restart()
    {
        await using var app = await TestApp.CreateAsync(transport: new AmbiguousEmail());
        var item = await app.RegisterAsync();
        await Assert.ThrowsAsync<WelcomeEmailOutcomeUnknownException>(() => app.Get<WelcomeEmailJob>().SendAsync(item.Id, default));
        await app.Db(db => db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION fail_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit insert failure'; END; $$;
            CREATE TRIGGER fail_review_audit BEFORE INSERT ON "WelcomeEmailReconciliations" FOR EACH ROW EXECUTE FUNCTION fail_review_audit();
            """));
        await Assert.ThrowsAnyAsync<Exception>(() => app.Get<IWelcomeEmailReconciliation>().ResolveAsync(item.Id, "Accepted", "RECEIPT-1", "admin-test", default));
        Assert.Equal(WelcomeEmailStatus.NeedsReview, (await app.Delivery(item.Id)).Status);
        Assert.Null((await app.Delivery(item.Id)).SentAt);
        Assert.Equal(0, await app.Db(db => db.WelcomeEmailReconciliations.CountAsync()));
        await app.Db(db => db.Database.ExecuteSqlRawAsync("DROP TRIGGER fail_review_audit ON \"WelcomeEmailReconciliations\"; DROP FUNCTION fail_review_audit();"));
        await app.RestartAsync();
        await app.Get<IWelcomeEmailReconciliation>().ResolveAsync(item.Id, "Accepted", "RECEIPT-1", "admin-test", default);
        Assert.Equal(WelcomeEmailStatus.Sent, (await app.Delivery(item.Id)).Status);
        Assert.Equal("admin-test", await app.Db(db => db.WelcomeEmailReconciliations.Select(x => x.ActorId).SingleAsync()));
    }

    [Fact]
    public async Task Resolution_never_resets_attempt_cap_and_rejects_live_worker_lease()
    {
        await using var app = await TestApp.CreateAsync(transport: new RecordingEmail());
        var item = await app.RegisterAsync();
        await app.Db(async db => { var row = await db.WelcomeEmailDeliveries.SingleAsync(); row.Status = WelcomeEmailStatus.NeedsReview;
            row.AttemptCount = 4; row.LeaseExpiresAt = app.Clock.GetUtcNow().UtcDateTime.AddMinutes(2); return await db.SaveChangesAsync(); });
        await Assert.ThrowsAsync<ConflictException>(() => app.Get<IWelcomeEmailReconciliation>().ResolveAsync(item.Id, "NotAccepted", "INC-CAP-1", "admin-test", default));
        app.Clock.Advance(121);
        await app.Get<IWelcomeEmailReconciliation>().ResolveAsync(item.Id, "NotAccepted", "INC-CAP-1", "admin-test", default);
        Assert.Equal(WelcomeEmailStatus.Failed, (await app.Delivery(item.Id)).Status);
        Assert.Equal(4, (await app.Delivery(item.Id)).AttemptCount);
    }

    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("Author", HttpStatusCode.Forbidden)]
    public async Task Reconciliation_api_rejects_guest_and_author(string? role, HttpStatusCode expected)
    {
        await using var app = await TestApp.CreateAsync();
        using var client = app.Client;
        if (role is not null) client.DefaultRequestHeaders.Add("X-Test-Role", role);
        using var list = await client.GetAsync("/api/v1/admin/welcome-emails/reconciliation");
        using var change = await client.PostAsJsonAsync($"/api/v1/admin/welcome-emails/{Guid.NewGuid()}/reconcile", new { outcome = "Accepted", evidenceReference = "RECEIPT-1" });
        Assert.Equal(expected, list.StatusCode); Assert.Equal(expected, change.StatusCode);
        Assert.Equal(0, await app.Db(db => db.WelcomeEmailReconciliations.CountAsync()));
    }

    [Fact]
    public async Task Admin_api_has_bounded_redacted_list_validation_conflict_and_audited_resolution()
    {
        await using var app = await TestApp.CreateAsync(transport: new AmbiguousEmail());
        var item = await app.RegisterAsync();
        await Assert.ThrowsAsync<WelcomeEmailOutcomeUnknownException>(() => app.Get<WelcomeEmailJob>().SendAsync(item.Id, default));
        using var client = app.Client; client.DefaultRequestHeaders.Add("X-Test-Role", "Admin");
        using var list = await client.GetAsync("/api/v1/admin/welcome-emails/reconciliation?page=1&pageSize=1");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var json = await list.Content.ReadAsStringAsync();
        Assert.Contains($"welcome-{item.Id:N}@culinary.invalid", json);
        Assert.DoesNotContain(item.RecipientEmail, json); Assert.DoesNotContain("leaseToken", json);
        using var invalidPage = await client.GetAsync("/api/v1/admin/welcome-emails/reconciliation?pageSize=100");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalidPage.StatusCode);
        Assert.Contains("correlationId", await invalidPage.Content.ReadAsStringAsync());
        var path = $"/api/v1/admin/welcome-emails/{item.Id}/reconcile";
        using var invalid = await client.PostAsJsonAsync(path, new { outcome = "Guess", evidenceReference = "" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalid.StatusCode);
        using var unsafeEvidence = await client.PostAsJsonAsync(path, new { outcome = "Accepted", evidenceReference = "https://host/?secret=x" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, unsafeEvidence.StatusCode);
        using var accepted = await client.PostAsJsonAsync(path, new { outcome = "Accepted", evidenceReference = "SMTP-RECEIPT-1" });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        using var duplicate = await client.PostAsJsonAsync(path, new { outcome = "Accepted", evidenceReference = "SMTP-RECEIPT-1" });
        Assert.Equal(HttpStatusCode.OK, duplicate.StatusCode);
        using var conflict = await client.PostAsJsonAsync(path, new { outcome = "NotAccepted", evidenceReference = "SMTP-RECEIPT-1" });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        using var missing = await client.PostAsJsonAsync($"/api/v1/admin/welcome-emails/{Guid.NewGuid()}/reconcile", new { outcome = "Accepted", evidenceReference = "RECEIPT-404" });
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal("review-admin", await app.Db(db => db.WelcomeEmailReconciliations.Select(x => x.ActorId).SingleAsync()));
    }
}
