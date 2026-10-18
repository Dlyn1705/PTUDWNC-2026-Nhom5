using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MimeKit;

namespace CulinaryBlog.Infrastructure.Services.Email;

public sealed class WelcomeEmailOptions
{
    public bool Enabled { get; set; }
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 1025;
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string SecurityMode { get; set; } = "StartTls";
    public string FromAddress { get; set; } = "welcome@culinary.test";
    public string FromName { get; set; } = "Culinary Blog";
    public string PublicWebBaseUrl { get; set; } = "http://localhost:3000";
    public int TimeoutSeconds { get; set; } = 30;
    public int LeaseSeconds { get; set; } = 180;
    public int RetentionDays { get; set; } = 30;
}

public sealed class WelcomeEmailOptionsValidator(IHostEnvironment environment) : IValidateOptions<WelcomeEmailOptions>
{
    public ValidateOptionsResult Validate(string? name, WelcomeEmailOptions options)
    {
        if (!options.Enabled) return ValidateOptionsResult.Success;
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(options.Host) || options.Port is < 1 or > 65535) errors.Add("Email host/port are invalid.");
        if (!MailboxAddress.TryParse(options.FromAddress, out var from) || from.Address != options.FromAddress.Trim()) errors.Add("Email sender must be a single mailbox address.");
        if (options.SecurityMode is not ("None" or "StartTls" or "SslOnConnect")) errors.Add("Email SecurityMode is invalid.");
        if (options.TimeoutSeconds is < 1 or > 60 || options.LeaseSeconds < options.TimeoutSeconds * 3 + 30) errors.Add("Email timeout/lease are invalid.");
        if (options.RetentionDays is < 1 or > 365) errors.Add("Email retention must be between 1 and 365 days.");
        if (!Uri.TryCreate(options.PublicWebBaseUrl, UriKind.Absolute, out var url) || url.Scheme is not ("http" or "https") ||
            !string.IsNullOrEmpty(url.UserInfo) || !string.IsNullOrEmpty(url.Query) || !string.IsNullOrEmpty(url.Fragment))
            errors.Add("Email public web URL is invalid.");
        if (!environment.IsDevelopment() && !environment.IsEnvironment("Testing") &&
            (options.SecurityMode == "None" || url?.Scheme != "https")) errors.Add("Production email requires TLS and an HTTPS web URL.");
        if (string.IsNullOrEmpty(options.Username) != string.IsNullOrEmpty(options.Password)) errors.Add("Email username and password must be configured together.");
        return errors.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(errors);
    }
}
