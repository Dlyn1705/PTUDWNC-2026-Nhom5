namespace CulinaryBlog.Domain.Settings;

public sealed class JwtSettings
{
    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int AccessTokenDurationInMinutes { get; set; } = 15;
    public int RefreshTokenDurationInDays { get; set; } = 7;
}