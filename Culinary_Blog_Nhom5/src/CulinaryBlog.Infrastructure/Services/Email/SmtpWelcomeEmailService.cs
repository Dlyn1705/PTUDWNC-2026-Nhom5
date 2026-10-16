using System.Net;
using CulinaryBlog.Application.Contracts;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace CulinaryBlog.Infrastructure.Services.Email;

public static class WelcomeEmailTemplate
{
    public static (string Html, string Text) Render(string? displayName, string baseUrl)
    {
        var name = string.IsNullOrWhiteSpace(displayName) ? "bạn" : displayName.Trim();
        var recipes = new Uri(new Uri(baseUrl.TrimEnd('/') + "/"), "recipes").AbsoluteUri;
        var create = new Uri(new Uri(baseUrl.TrimEnd('/') + "/"), "dashboard/recipes/new").AbsoluteUri;
        var html = $"""
            <!doctype html><html lang="vi"><head><meta charset="utf-8"></head><body>
            <h1>Chào mừng đến với Culinary Blog!</h1>
            <p>Xin chào {WebUtility.HtmlEncode(name)},</p>
            <p>Cảm ơn bạn đã tham gia cộng đồng yêu nấu ăn của chúng tôi.</p>
            <p><a href="{WebUtility.HtmlEncode(recipes)}">Khám phá công thức</a></p>
            <p>Đăng nhập để <a href="{WebUtility.HtmlEncode(create)}">tạo công thức đầu tiên</a>.</p>
            <p>Đây là thư chào mừng, không phải thư xác minh tài khoản. Bạn không cần chờ thư để đăng nhập.</p>
            </body></html>
            """;
        return (html, $"Xin chào {name},\nChào mừng đến với Culinary Blog!\nKhám phá công thức: {recipes}\nĐăng nhập để tạo công thức: {create}\nĐây là thư chào mừng, không phải thư xác minh tài khoản.");
    }
}

public sealed class SmtpWelcomeEmailService(IOptions<WelcomeEmailOptions> settings) : IEmailService
{
    public async Task SendWelcomeEmailAsync(string toEmail, string userName, CancellationToken ct = default)
    {
        var options = settings.Value;
        if (!options.Enabled) throw new InvalidOperationException("Email delivery is disabled.");
        var content = WelcomeEmailTemplate.Render(userName, options.PublicWebBaseUrl);
        using var message = new MimeMessage();
        message.From.Add(new MailboxAddress(options.FromName, options.FromAddress));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = "Chào mừng bạn đến với Culinary Blog";
        message.Body = new BodyBuilder { HtmlBody = content.Html, TextBody = content.Text }.ToMessageBody();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(options.TimeoutSeconds));
        using var smtp = new SmtpClient { Timeout = options.TimeoutSeconds * 1000 };
        await smtp.ConnectAsync(options.Host, options.Port, Enum.Parse<SecureSocketOptions>(options.SecurityMode), deadline.Token);
        if (!string.IsNullOrEmpty(options.Username)) await smtp.AuthenticateAsync(options.Username, options.Password!, deadline.Token);
        await smtp.SendAsync(message, deadline.Token);
        // SMTP acceptance is success. A failing QUIT must not cause another delivery.
        try { await smtp.DisconnectAsync(true, deadline.Token); } catch { /* Dispose closes the connection. */ }
    }
}
