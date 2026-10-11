using CulinaryBlog.Application.Contracts;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using MimeKit;

namespace CulinaryBlog.Infrastructure.Services;

public sealed class SmtpEmailService(IConfiguration configuration) : IEmailService
{
    public async Task SendWelcomeEmailAsync(string toEmail, string userName, CancellationToken ct = default)
    {
        var host = configuration["Smtp:Host"];
        if (string.IsNullOrWhiteSpace(host))
            throw new InvalidOperationException("SMTP host is not configured.");

        var port = configuration.GetValue("Smtp:Port", 1025);
        var fromAddress = configuration["Smtp:FromAddress"] ?? "no-reply@culinary.local";
        var fromName = configuration["Smtp:FromName"] ?? "Culinary Blog";
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(fromName, fromAddress));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = "Chào mừng bạn đến với Culinary Blog";
        message.Body = new TextPart("plain")
        {
            Text = $"Xin chào {userName},\n\nChào mừng bạn đến với Culinary Blog. Hãy bắt đầu chia sẻ công thức nấu ăn của mình nhé!"
        };

        using var client = new SmtpClient();
        var useTls = configuration.GetValue("Smtp:UseStartTls", false);
        await client.ConnectAsync(host, port, useTls ? SecureSocketOptions.StartTlsWhenAvailable : SecureSocketOptions.None, ct);
        var username = configuration["Smtp:Username"];
        var password = configuration["Smtp:Password"];
        if (!string.IsNullOrWhiteSpace(username))
            await client.AuthenticateAsync(username, password ?? string.Empty, ct);
        await client.SendAsync(message, ct);
        await client.DisconnectAsync(true, ct);
    }
}
