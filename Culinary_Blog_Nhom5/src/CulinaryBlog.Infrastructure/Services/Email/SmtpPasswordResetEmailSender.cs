using CulinaryBlog.Application.Contracts;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace CulinaryBlog.Infrastructure.Services.Email;

public sealed class SmtpPasswordResetEmailSender(IOptions<WelcomeEmailOptions> settings) : IPasswordResetEmailSender
{
    public async Task SendAsync(string email, string token, CancellationToken cancellationToken)
    {
        var options = settings.Value;
        if (!options.Enabled) throw new InvalidOperationException("Email delivery is disabled.");
        var url = new Uri(new Uri(options.PublicWebBaseUrl.TrimEnd('/') + "/"),
            $"auth/reset-password?email={Uri.EscapeDataString(email)}&token={Uri.EscapeDataString(token)}");
        using var message = new MimeMessage();
        message.From.Add(new MailboxAddress(options.FromName, options.FromAddress));
        message.To.Add(MailboxAddress.Parse(email));
        message.Subject = "Đặt lại mật khẩu Culinary Blog";
        message.Body = new BodyBuilder
        {
            TextBody = $"Mở liên kết này để đặt lại mật khẩu trong 30 phút: {url}\nNếu bạn không yêu cầu, hãy bỏ qua thư này.",
            HtmlBody = $"<p>Liên kết đặt lại mật khẩu có hiệu lực 30 phút: <a href=\"{System.Net.WebUtility.HtmlEncode(url.AbsoluteUri)}\">Đặt lại mật khẩu</a></p><p>Nếu bạn không yêu cầu, hãy bỏ qua thư này.</p>"
        }.ToMessageBody();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(options.TimeoutSeconds));
        using var smtp = new SmtpClient { Timeout = options.TimeoutSeconds * 1000 };
        await smtp.ConnectAsync(options.Host, options.Port, Enum.Parse<SecureSocketOptions>(options.SecurityMode), deadline.Token);
        if (!string.IsNullOrEmpty(options.Username))
            await smtp.AuthenticateAsync(options.Username, options.Password!, deadline.Token);
        await smtp.SendAsync(message, deadline.Token);
        try { await smtp.DisconnectAsync(true, deadline.Token); } catch { /* SMTP accepted the message. */ }
    }
}
