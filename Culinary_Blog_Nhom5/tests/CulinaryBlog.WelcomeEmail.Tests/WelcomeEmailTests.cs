using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure.Services;
using CulinaryBlog.Infrastructure.Services.Email;
using CulinaryBlog.Infrastructure.Persistence;
using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting.Internal;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MimeKit;
using Xunit;

[assembly: CollectionBehavior(DisableTestParallelization = true)]
namespace CulinaryBlog.WelcomeEmail.Tests;

public sealed class TemplateAndOptionsTests
{
    [Fact]
    public void Template_encodes_name_preserves_vietnamese_and_uses_trusted_links()
    {
        var (html, text) = WelcomeEmailTemplate.Render("Bếp <script> & \"", "https://food.example");
        Assert.DoesNotContain("<script>", html);
        Assert.Contains("&lt;script&gt;", html);
        Assert.Contains("Bếp", text);
        Assert.Contains("https://food.example/recipes", html);
        Assert.Contains("https://food.example/dashboard/recipes/new", text);
        Assert.Contains("Xin chào bạn", WelcomeEmailTemplate.Render(" ", "https://food.example").Text);
        Assert.DoesNotContain("token=", html);
    }

    [Theory]
    [InlineData("Development", "None", "http://localhost:3000", true)]
    [InlineData("Production", "None", "https://food.example", false)]
    [InlineData("Production", "StartTls", "http://food.example", false)]
    [InlineData("Production", "StartTls", "https://food.example", true)]
    [InlineData("Production", "SslOnConnect", "https://food.example", true)]
    [InlineData("Development", "Auto", "http://localhost:3000", false)]
    [InlineData("Development", "None", "https://food.example/?token=secret", false)]
    public void Config_enforces_transport_security(string environment, string mode, string url, bool valid)
    {
        var options = new WelcomeEmailOptions { Enabled = true, SecurityMode = mode, PublicWebBaseUrl = url };
        Assert.Equal(valid, new WelcomeEmailOptionsValidator(new HostingEnvironment { EnvironmentName = environment }).Validate(null, options).Succeeded);
    }

    [Fact]
    public void Invalid_sender_credentials_timeout_and_lease_are_rejected_when_enabled()
    {
        var validator = new WelcomeEmailOptionsValidator(new HostingEnvironment { EnvironmentName = "Development" });
        var options = new WelcomeEmailOptions { Enabled = true, FromAddress = "not-mail", Username = "user", LeaseSeconds = 1, Port = 0 };
        Assert.True(validator.Validate(null, options).Failed);
        options.Enabled = false;
        Assert.True(validator.Validate(null, options).Succeeded);
    }

    [Fact]
    public void Job_has_three_retries_and_safe_failure_details()
    {
        var policy = typeof(WelcomeEmailJob).GetMethod(nameof(WelcomeEmailJob.SendAsync))!.CustomAttributes.Single(x => x.AttributeType == typeof(AutomaticRetryAttribute));
        Assert.Equal(3, policy.NamedArguments.Single(x => x.MemberName == "Attempts").TypedValue.Value);
        var delays = (IEnumerable<CustomAttributeTypedArgument>)policy.NamedArguments.Single(x => x.MemberName == "DelaysInSeconds").TypedValue.Value!;
        Assert.Equal(new[] { 60, 300, 900 }, delays.Select(x => (int)x.Value!));
        Assert.Null(new WelcomeEmailSendException().InnerException);
    }
}

public sealed class DeliveryIntegrationTests
{
    [Fact]
    public async Task Registration_is_atomic_unique_and_keeps_auth_contract_without_waiting_for_email()
    {
        var transport = new RecordingEmail { Fail = true };
        await using var app = await TestApp.CreateAsync(transport: transport);
        var item = await app.RegisterAsync();
        Assert.Equal(0, transport.Calls);
        Assert.Equal(WelcomeEmailStatus.Pending, item.Status);
        Assert.False(await app.Db(db => db.Users.Where(x => x.Id == item.UserId).Select(x => x.EmailConfirmed).SingleAsync()));
        Assert.Equal(1, await app.Db(db => db.RefreshTokens.CountAsync()));
        using var duplicate = await app.Client.PostAsJsonAsync("/api/v1/auth/register", new { Email = item.RecipientEmail, DisplayName = "Bếp", Password = "Test-Only!1234", ConfirmPassword = "Test-Only!1234" });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        using var invalid = await app.Client.PostAsJsonAsync("/api/v1/auth/register", new { Email = "invalid", DisplayName = "", Password = "weak" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalid.StatusCode);
        using var login = await app.Client.PostAsJsonAsync("/api/v1/auth/login", new { Email = item.RecipientEmail, Password = "Test-Only!1234", ConfirmPassword = "Test-Only!1234" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        using var refreshRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh");
        refreshRequest.Headers.Add("Cookie", cookie);
        using var refresh = await app.Client.SendAsync(refreshRequest);
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        Assert.Equal(1, await app.Db(db => db.WelcomeEmailDeliveries.CountAsync()));
        await Assert.ThrowsAsync<DbUpdateException>(() => app.Db(async db => { db.WelcomeEmailDeliveries.Add(new WelcomeEmailDelivery { UserId = item.UserId, RecipientEmail = item.RecipientEmail }); return await db.SaveChangesAsync(); }));
    }

    [Fact]
    public async Task Outbox_insert_failure_rolls_back_user_role_assignment_and_refresh_token()
    {
        await using var app = await TestApp.CreateAsync();
        await app.Db(db => db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION fail_welcome_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only outbox failure'; END; $$;
            CREATE TRIGGER fail_welcome_test BEFORE INSERT ON "WelcomeEmailDeliveries" FOR EACH ROW EXECUTE FUNCTION fail_welcome_test();
            """));
        using var response = await app.Client.PostAsJsonAsync("/api/v1/auth/register", new { Email = "rollback@welcome.test", DisplayName = "Bếp", Password = "Test-Only!1234", ConfirmPassword = "Test-Only!1234" });
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(0, await app.Db(db => db.Users.CountAsync()));
        Assert.Equal(0, await app.Db(db => db.RefreshTokens.CountAsync()));
        Assert.Equal(0, await app.Db(db => db.WelcomeEmailDeliveries.CountAsync()));
    }

    [Fact]
    public async Task Commit_replay_and_google_new_existing_linked_paths_create_only_one_intent_per_new_account()
    {
        await using var app = await TestApp.CreateAsync();
        using var scope = app.Services.CreateScope();
        var auth = (AuthService)scope.ServiceProvider.GetRequiredService<IAuthService>();
        var jwt = scope.ServiceProvider.GetRequiredService<IJwtService>();
        var stable = jwt.GenerateRefreshToken();
        var strategy = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.CreateExecutionStrategy();
        var userId = Guid.NewGuid().ToString();
        var local = typeof(AuthService).GetMethod("RegisterCoreAsync", BindingFlags.NonPublic | BindingFlags.Instance)!;
        async Task Local() => await strategy.ExecuteAsync(async () => await (Task<AuthResponseDto>)local.Invoke(auth, ["replay@welcome.test", "Bếp", "Test-Only!1234", userId, stable, CancellationToken.None])!);
        await Local(); await Local();
        Assert.Equal(1, await app.Db(db => db.WelcomeEmailDeliveries.CountAsync()));
        Assert.Equal(1, await app.Db(db => db.RefreshTokens.CountAsync()));
        // Exercise the transaction AFTER Google token verification; no fabricated token bypasses the public endpoint.
        var google = typeof(AuthService).GetMethod("GoogleLoginCoreAsync", BindingFlags.NonPublic | BindingFlags.Instance)!;
        async Task Google(string subject, string email, (string RawToken, string TokenHash) token) =>
            await strategy.ExecuteAsync(async () => await (Task<AuthResponseDto>)google.Invoke(auth, ["Google", subject, email, "Bếp", null, token, CancellationToken.None])!);
        var googleToken = jwt.GenerateRefreshToken();
        await Google("new-subject", "google-new@welcome.test", googleToken);
        await Google("new-subject", "google-new@welcome.test", googleToken);
        await Google("new-subject", "google-new@welcome.test", jwt.GenerateRefreshToken());
        await Google("link-existing", "replay@welcome.test", jwt.GenerateRefreshToken());
        Assert.Equal(2, await app.Db(db => db.WelcomeEmailDeliveries.CountAsync()));
    }

    [Fact]
    public async Task Concurrent_jobs_claim_once_and_sent_redelivery_is_noop()
    {
        var transport = new RecordingEmail { Gate = new(TaskCreationOptions.RunContinuationsAsynchronously) };
        await using var app = await TestApp.CreateAsync(transport: transport);
        var item = await app.RegisterAsync();
        var first = app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        await transport.Entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        Assert.Equal(1, transport.Calls);
        transport.Gate.SetResult(); await first;
        await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        Assert.Equal(1, transport.Calls);
        var final = await app.Delivery(item.Id);
        Assert.Equal(WelcomeEmailStatus.Sent, final.Status); Assert.NotNull(final.SentAt); Assert.Null(final.LeaseToken);
    }

    [Fact]
    public async Task Backoff_and_durable_cap_stop_after_four_transport_failures_even_with_duplicate_jobs()
    {
        var transport = new RecordingEmail { Fail = true };
        await using var app = await TestApp.CreateAsync(transport: transport);
        var item = await app.RegisterAsync();
        for (var attempt = 1; attempt <= 4; attempt++)
        {
            var error = await Assert.ThrowsAsync<WelcomeEmailSendException>(() => app.Get<WelcomeEmailJob>().SendAsync(item.Id, default));
            Assert.Null(error.InnerException); Assert.DoesNotContain("private", error.ToString());
            var current = await app.Delivery(item.Id);
            Assert.Equal(attempt, current.AttemptCount); Assert.Equal("TransportFailure", current.LastErrorCode);
            await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
            Assert.Equal(attempt, transport.Calls);
            app.Clock.Advance(WelcomeEmailStore.RetryDelays[Math.Min(attempt - 1, 2)] + 1);
        }
        await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        Assert.Equal(WelcomeEmailStatus.Failed, (await app.Delivery(item.Id)).Status); Assert.Equal(4, transport.Calls);
    }

    [Fact]
    public async Task Disabled_mode_preserves_pending_and_reenable_allows_claim()
    {
        await using var app = await TestApp.CreateAsync();
        var item = await app.RegisterAsync();
        app.Options.Enabled = false;
        await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
        Assert.Null(await app.Get<WelcomeEmailStore>().ClaimAsync(item.Id, default));
        Assert.Equal(0, (await app.Delivery(item.Id)).AttemptCount);
        Assert.Null((await app.Delivery(item.Id)).HangfireJobId);
        await Assert.ThrowsAsync<InvalidOperationException>(() => app.Get<IEmailService>().SendWelcomeEmailAsync("disabled@welcome.test", "Bếp"));
        app.Options.Enabled = true;
        Assert.NotNull(await app.Get<WelcomeEmailStore>().ClaimAsync(item.Id, default));
    }

    [Theory]
    [InlineData("inactive", "AccountUnavailable")]
    [InlineData("deleted", "AccountUnavailable")]
    [InlineData("changed", "RecipientChanged")]
    public async Task Unavailable_or_changed_account_is_skipped_without_sending(string change, string reason)
    {
        await using var app = await TestApp.CreateAsync();
        var item = await app.RegisterAsync();
        await app.Db(async db =>
        {
            var user = await db.Users.SingleAsync();
            if (change == "deleted") db.Users.Remove(user);
            else if (change == "inactive") user.IsActive = false;
            else user.Email = "changed@welcome.test";
            return await db.SaveChangesAsync();
        });
        Assert.Null(await app.Get<WelcomeEmailStore>().ClaimAsync(item.Id, default));
        var final = await app.Delivery(item.Id);
        Assert.Equal(WelcomeEmailStatus.Skipped, final.Status); Assert.Equal(reason, final.LastErrorCode); Assert.Equal(0, final.AttemptCount);
    }

    [Fact]
    public async Task Expired_lease_recovers_and_previous_worker_cannot_mark_new_lease_sent()
    {
        await using var app = await TestApp.CreateAsync();
        var item = await app.RegisterAsync();
        var store = app.Get<WelcomeEmailStore>();
        var abandoned = (await store.ClaimAsync(item.Id, default))!;
        Assert.Null(await store.ClaimAsync(item.Id, default));
        app.Clock.Advance(app.Options.LeaseSeconds + 1);
        await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
        Assert.NotNull((await app.Delivery(item.Id)).HangfireJobId);
        var recovered = (await store.ClaimAsync(item.Id, default))!;
        Assert.NotEqual(abandoned.LeaseToken, recovered.LeaseToken);
        await Assert.ThrowsAsync<InvalidOperationException>(() => store.CompleteAsync(abandoned, default));
        await store.CompleteAsync(recovered, default);
        Assert.Equal(WelcomeEmailStatus.Sent, (await app.Delivery(item.Id)).Status);
    }

    [Fact]
    public async Task Dispatcher_handles_queue_failure_parallel_dispatch_and_missing_job_without_leaking_payload()
    {
        await using var app = await TestApp.CreateAsync();
        var item = await app.RegisterAsync();
        var broken = new WelcomeEmailDispatcher(app.Get<IServiceScopeFactory>(), new BrokenQueue(), app.Get<JobStorage>(),
            app.Get<IOptions<WelcomeEmailOptions>>(), app.Clock, NullLogger<WelcomeEmailDispatcher>.Instance);
        await broken.DispatchAsync(default);
        Assert.Null((await app.Delivery(item.Id)).HangfireJobId);
        await Task.WhenAll(app.Get<WelcomeEmailDispatcher>().DispatchAsync(default), app.Get<WelcomeEmailDispatcher>().DispatchAsync(default));
        var queued = await app.Delivery(item.Id);
        using var connection = app.Get<JobStorage>().GetConnection();
        var data = connection.GetJobData(queued.HangfireJobId)!;
        Assert.Equal(typeof(WelcomeEmailJob), data.Job.Type);
        Assert.Equal(item.Id, data.Job.Args[0]);
        Assert.Equal(2, data.Job.Args.Count);
        Assert.IsType<Guid>(data.Job.Args[0]);
        Assert.IsType<CancellationToken>(data.Job.Args[1]);
        Assert.Equal(1, app.Get<JobStorage>().GetMonitoringApi().EnqueuedCount("default"));
        app.Get<IBackgroundJobClient>().Delete(queued.HangfireJobId);
        await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
        Assert.NotEqual(queued.HangfireJobId, (await app.Delivery(item.Id)).HangfireJobId);
    }

    [Fact]
    public async Task Retention_removes_old_sent_skipped_scrubs_failed_recipient_and_keeps_pending()
    {
        await using var app = await TestApp.CreateAsync();
        var item = await app.RegisterAsync();
        await app.Db(async db =>
        {
            foreach (var state in new[] { WelcomeEmailStatus.Sent, WelcomeEmailStatus.Skipped, WelcomeEmailStatus.Failed })
                db.WelcomeEmailDeliveries.Add(new WelcomeEmailDelivery { UserId = Guid.NewGuid().ToString(), RecipientEmail = "old@welcome.test", Status = state, UpdatedAt = DateTime.UtcNow.AddDays(-40) });
            return await db.SaveChangesAsync();
        });
        await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
        Assert.Equal(2, await app.Db(db => db.WelcomeEmailDeliveries.CountAsync()));
        Assert.Equal("", await app.Db(db => db.WelcomeEmailDeliveries.Where(x => x.Status == WelcomeEmailStatus.Failed).Select(x => x.RecipientEmail).SingleAsync()));
        Assert.Equal(WelcomeEmailStatus.Pending, (await app.Delivery(item.Id)).Status);
    }

    [Fact]
    public async Task Accepted_transport_then_db_failure_keeps_processing_and_documents_possible_duplicate_on_recovery()
    {
        var transport = new RecordingEmail();
        await using var app = await TestApp.CreateAsync(transport: transport);
        var item = await app.RegisterAsync();
        await app.Db(db => db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION fail_sent_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
              IF NEW."Status" = 'Sent' THEN RAISE EXCEPTION 'test-only sent commit failure'; END IF;
              RETURN NEW;
            END; $$;
            CREATE TRIGGER fail_sent_test BEFORE UPDATE ON "WelcomeEmailDeliveries" FOR EACH ROW EXECUTE FUNCTION fail_sent_test();
            """));
        await Assert.ThrowsAnyAsync<Exception>(() => app.Get<WelcomeEmailJob>().SendAsync(item.Id, default));
        Assert.Equal(1, transport.Calls);
        Assert.Equal(WelcomeEmailStatus.Processing, (await app.Delivery(item.Id)).Status);
        await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        Assert.Equal(1, transport.Calls);
        await app.Db(db => db.Database.ExecuteSqlRawAsync("DROP TRIGGER fail_sent_test ON \"WelcomeEmailDeliveries\"; DROP FUNCTION fail_sent_test();"));
        app.Clock.Advance(app.Options.LeaseSeconds + 1);
        await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        Assert.Equal(WelcomeEmailStatus.Sent, (await app.Delivery(item.Id)).Status);
        Assert.Equal(2, transport.Calls); // SMTP and PostgreSQL have no shared commit: never promise exactly-once.
    }

    [Fact]
    public async Task Worker_cancellation_releases_lease_with_backoff_and_never_marks_sent()
    {
        var transport = new RecordingEmail { Gate = new(TaskCreationOptions.RunContinuationsAsynchronously) };
        await using var app = await TestApp.CreateAsync(transport: transport);
        var item = await app.RegisterAsync();
        using var cancel = new CancellationTokenSource();
        var running = app.Get<WelcomeEmailJob>().SendAsync(item.Id, cancel.Token);
        await transport.Entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        cancel.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => running);
        var current = await app.Delivery(item.Id);
        Assert.Equal(WelcomeEmailStatus.Pending, current.Status); Assert.Equal("TransportInterrupted", current.LastErrorCode);
        Assert.Null(current.LeaseToken); Assert.Null(current.SentAt);
        await app.Get<WelcomeEmailJob>().SendAsync(item.Id, default);
        Assert.Equal(1, transport.Calls);
    }

    [Fact]
    public async Task Real_smtp_connection_failure_leaves_durable_pending_without_rolling_back_registration()
    {
        await using var app = await TestApp.CreateAsync();
        var item = await app.RegisterAsync();
        // Reserve then close a loopback port rather than contacting any external SMTP host.
        var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start(); app.Options.Port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        await Assert.ThrowsAsync<WelcomeEmailSendException>(() => app.Get<WelcomeEmailJob>().SendAsync(item.Id, default));
        Assert.Equal(WelcomeEmailStatus.Pending, (await app.Delivery(item.Id)).Status);
        Assert.Equal(1, await app.Db(db => db.Users.CountAsync()));
        Assert.Equal(1, (await app.Delivery(item.Id)).AttemptCount);
    }

    [Fact]
    public async Task Real_hangfire_worker_records_scheduled_retry_after_transport_failure()
    {
        var transport = new RecordingEmail { Fail = true };
        await using var app = await TestApp.CreateAsync(worker: true, transport: transport);
        var item = await app.RegisterAsync();
        await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
        var queued = await app.Delivery(item.Id);
        await app.WaitForAsync(() =>
        {
            using var connection = app.Get<JobStorage>().GetConnection();
            return Task.FromResult(connection.GetJobData(queued.HangfireJobId)?.State == "Scheduled");
        });
        Assert.Equal(1, transport.Calls);
        Assert.Equal(WelcomeEmailStatus.Pending, (await app.Delivery(item.Id)).Status);
        Assert.True((await app.Delivery(item.Id)).NextAttemptAt > app.Clock.GetUtcNow().UtcDateTime);
    }

    private sealed class BrokenQueue : IBackgroundJobClient
    {
        public string Create(Job job, IState state) => throw new InvalidOperationException("test-only queue outage");
        public bool ChangeState(string jobId, IState state, string expectedState) => throw new InvalidOperationException("test-only queue outage");
    }
}
