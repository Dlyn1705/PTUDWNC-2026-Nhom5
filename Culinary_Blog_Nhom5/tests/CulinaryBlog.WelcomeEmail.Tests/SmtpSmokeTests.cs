using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure.Services.Email;
using Hangfire;
using MimeKit;
using Xunit;
using Microsoft.EntityFrameworkCore;
using CulinaryBlog.Application.Contracts;

namespace CulinaryBlog.WelcomeEmail.Tests;

public sealed class SmtpSmokeTests(Xunit.Abstractions.ITestOutputHelper output)
{
    [Fact]
    public async Task Real_smtp_acceptance_with_db_outage_never_resends_after_host_restart_and_receipt_reconciliation()
    {
        using var mailhog = new HttpClient { BaseAddress = new Uri(Environment.GetEnvironmentVariable("WELCOME_EMAIL_TEST_MAILHOG_URL") ?? "http://127.0.0.1:8025") };
        var address = Guid.NewGuid().ToString("N") + "@welcome.test";
        async Task<JsonElement[]> Messages()
        {
            using var json = await mailhog.GetFromJsonAsync<JsonDocument>("/api/v2/search?kind=to&query=" + Uri.EscapeDataString(address));
            return json!.RootElement.GetProperty("items").EnumerateArray().Select(x => x.Clone()).ToArray();
        }
        try
        {
            await using var app = await TestApp.CreateAsync();
            var item = await app.RegisterAsync(address);
            await app.Db(db => db.Database.ExecuteSqlRawAsync("""
                CREATE FUNCTION fail_finalize_outcome() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
                  IF NEW."Status" IN ('Sent', 'NeedsReview') THEN RAISE EXCEPTION 'test DB unavailable during finalize/hold'; END IF;
                  RETURN NEW; END; $$;
                CREATE TRIGGER fail_finalize_outcome BEFORE UPDATE ON "WelcomeEmailDeliveries" FOR EACH ROW EXECUTE FUNCTION fail_finalize_outcome();
                """));
            await Assert.ThrowsAsync<WelcomeEmailFinalizeException>(() => app.Get<WelcomeEmailJob>().SendAsync(item.Id, default));
            var uncertain = await app.Delivery(item.Id);
            Assert.Equal(WelcomeEmailStatus.Processing, uncertain.Status); Assert.NotNull(uncertain.SubmissionStartedAt); Assert.Null(uncertain.SentAt);
            var captured = Assert.Single(await Messages());
            var receipt = captured.GetProperty("ID").GetString()!;
            await using (var stream = await mailhog.GetStreamAsync($"/api/v1/messages/{receipt}/download"))
            {
                using var message = await MimeMessage.LoadAsync(stream);
                Assert.Equal($"welcome-{item.Id:N}@culinary.invalid", message.MessageId);
            }
            await app.Db(db => db.Database.ExecuteSqlRawAsync("DROP TRIGGER fail_finalize_outcome ON \"WelcomeEmailDeliveries\"; DROP FUNCTION fail_finalize_outcome();"));
            app.Clock.Advance(app.Options.LeaseSeconds + 1); await app.RestartAsync(worker: true);
            await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
            var jobId = app.Get<IBackgroundJobClient>().Enqueue<WelcomeEmailJob>(job => job.SendAsync(item.Id, CancellationToken.None));
            await app.WaitForAsync(() => { using var connection = app.Get<JobStorage>().GetConnection();
                return Task.FromResult(connection.GetJobData(jobId)?.State == "Succeeded"); });
            Assert.Equal(WelcomeEmailStatus.NeedsReview, (await app.Delivery(item.Id)).Status);
            Assert.Single(await Messages());
            var reference = "MH-" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(receipt)));
            await app.Get<IWelcomeEmailReconciliation>().ResolveAsync(item.Id, "Accepted", reference, "test-admin", default);
            await app.Get<IWelcomeEmailReconciliation>().ResolveAsync(item.Id, "Accepted", reference, "test-admin", default);
            Assert.Equal(WelcomeEmailStatus.Sent, (await app.Delivery(item.Id)).Status);
            Assert.Single(await Messages());
            Assert.Equal(1, (await app.Delivery(item.Id)).AttemptCount);
            output.WriteLine("DURABILITY_EVIDENCE " + JsonSerializer.Serialize(new { scenario = "smtp-accepted-db-outage-restart-no-resend",
                businessKey = item.Id, correlationId = $"job-welcome-{item.Id:N}", capturedMessages = 1, attempts = 1,
                status = "SentAfterReceiptReconciliation", auditRows = await app.Db(db => db.WelcomeEmailReconciliations.CountAsync()) }));
        }
        finally
        {
            foreach (var message in await Messages())
            {
                using var response = await mailhog.DeleteAsync("/api/v1/messages/" + message.GetProperty("ID").GetString());
                response.EnsureSuccessStatusCode();
            }
        }
    }

    [Fact]
    public async Task Registration_to_real_worker_to_local_smtp_delivers_html_text_once()
    {
        using var mailhog = new HttpClient { BaseAddress = new Uri(Environment.GetEnvironmentVariable("WELCOME_EMAIL_TEST_MAILHOG_URL") ?? "http://127.0.0.1:8025") };
        var address = Guid.NewGuid().ToString("N") + "@welcome.test";
        async Task<JsonElement[]> Messages()
        {
            using var json = await mailhog.GetFromJsonAsync<JsonDocument>("/api/v2/search?kind=to&query=" + Uri.EscapeDataString(address));
            return json!.RootElement.GetProperty("items").EnumerateArray().Select(x => x.Clone()).ToArray();
        }
        try
        {
            await using var app = await TestApp.CreateAsync(worker: false);
            var item = await app.RegisterAsync(address);
            await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
            var queued = await app.Delivery(item.Id);
            Assert.NotNull(queued.HangfireJobId); Assert.Equal(WelcomeEmailStatus.Pending, queued.Status);
            await app.RestartAsync(worker: true);
            var smtpTimeout = TimeSpan.FromSeconds(60);
            await app.WaitForAsync(async () => (await app.Delivery(item.Id)).Status == WelcomeEmailStatus.Sent, smtpTimeout);
            await app.WaitForAsync(async () => (await Messages()).Length == 1, smtpTimeout);
            var captured = Assert.Single(await Messages());
            var id = captured.GetProperty("ID").GetString();
            await using var stream = await mailhog.GetStreamAsync($"/api/v1/messages/{id}/download");
            using var message = await MimeMessage.LoadAsync(stream);
            Assert.Equal("Chào mừng bạn đến với Culinary Blog", message.Subject);
            Assert.Equal($"welcome-{item.Id:N}@culinary.invalid", message.MessageId);
            Assert.Equal(address, Assert.Single(message.To.Mailboxes).Address);
            Assert.NotNull(message.HtmlBody); Assert.NotNull(message.TextBody);
            Assert.DoesNotContain("<script>", message.HtmlBody);
            Assert.Contains("&lt;script&gt;", message.HtmlBody);
            Assert.Contains("Bếp Việt", message.TextBody);
            Assert.Contains("http://localhost:3000/recipes", message.HtmlBody);
            await app.RestartAsync(worker: true);
            var duplicateJob = app.Get<IBackgroundJobClient>().Enqueue<WelcomeEmailJob>(job => job.SendAsync(item.Id, CancellationToken.None));
            await app.WaitForAsync(() =>
            {
                using var connection = app.Get<JobStorage>().GetConnection();
                return Task.FromResult(connection.GetJobData(duplicateJob)?.State == "Succeeded");
            });
            Assert.Single(await Messages());
            Assert.Equal(1, (await app.Delivery(item.Id)).AttemptCount);
            output.WriteLine("DURABILITY_EVIDENCE " + System.Text.Json.JsonSerializer.Serialize(new {
                scenario = "welcome-outbox-api-hangfire-restart", businessKey = item.Id,
                correlationId = $"job-welcome-{item.Id:N}", status = "Sent", attempts = 1, capturedMessages = 1
            }));
        }
        finally
        {
            // Only delete messages belonging to this test's unique fake recipient.
            foreach (var message in await Messages())
            {
                using var deleted = await mailhog.DeleteAsync("/api/v1/messages/" + message.GetProperty("ID").GetString());
                deleted.EnsureSuccessStatusCode();
            }
        }
    }
}
