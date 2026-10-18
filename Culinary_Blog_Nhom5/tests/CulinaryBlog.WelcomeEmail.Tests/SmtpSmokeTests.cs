using System.Net.Http.Json;
using System.Text.Json;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure.Services.Email;
using Hangfire;
using MimeKit;
using Xunit;

namespace CulinaryBlog.WelcomeEmail.Tests;

public sealed class SmtpSmokeTests
{
    [Fact]
    public async Task Registration_to_real_worker_to_local_smtp_delivers_html_text_once()
    {
        using var mailhog = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:8025") };
        var address = Guid.NewGuid().ToString("N") + "@welcome.test";
        async Task<JsonElement[]> Messages()
        {
            using var json = await mailhog.GetFromJsonAsync<JsonDocument>("/api/v2/search?kind=to&query=" + Uri.EscapeDataString(address));
            return json!.RootElement.GetProperty("items").EnumerateArray().Select(x => x.Clone()).ToArray();
        }
        try
        {
            await using var app = await TestApp.CreateAsync(worker: true);
            var item = await app.RegisterAsync(address);
            await app.Get<WelcomeEmailDispatcher>().DispatchAsync(default);
            await app.WaitForAsync(async () => (await app.Delivery(item.Id)).Status == WelcomeEmailStatus.Sent);
            await app.WaitForAsync(async () => (await Messages()).Length == 1);
            var captured = Assert.Single(await Messages());
            var id = captured.GetProperty("ID").GetString();
            await using var stream = await mailhog.GetStreamAsync($"/api/v1/messages/{id}/download");
            using var message = await MimeMessage.LoadAsync(stream);
            Assert.Equal("Chào mừng bạn đến với Culinary Blog", message.Subject);
            Assert.Equal(address, Assert.Single(message.To.Mailboxes).Address);
            Assert.NotNull(message.HtmlBody); Assert.NotNull(message.TextBody);
            Assert.DoesNotContain("<script>", message.HtmlBody);
            Assert.Contains("&lt;script&gt;", message.HtmlBody);
            Assert.Contains("Bếp Việt", message.TextBody);
            Assert.Contains("http://localhost:3000/recipes", message.HtmlBody);
            var duplicateJob = app.Get<IBackgroundJobClient>().Enqueue<WelcomeEmailJob>(job => job.SendAsync(item.Id, CancellationToken.None));
            await app.WaitForAsync(() =>
            {
                using var connection = app.Get<JobStorage>().GetConnection();
                return Task.FromResult(connection.GetJobData(duplicateJob)?.State == "Succeeded");
            });
            Assert.Single(await Messages());
            Assert.Equal(1, (await app.Delivery(item.Id)).AttemptCount);
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
