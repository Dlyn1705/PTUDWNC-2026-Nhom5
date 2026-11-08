using System.Buffers.Binary;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Text;
using CulinaryBlog.API.Security;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Settings;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace CulinaryBlog.Security.Tests;

public sealed class CredentialSecurityTests
{
    [Fact]
    public void Configured_identity_hasher_uses_pbkdf2_hmac_sha512_with_at_least_100000_rounds()
    {
        var settings = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=unused",
            ["Minio:AccessKey"] = "test", ["Minio:SecretKey"] = "test"
        }).Build();
        using var provider = new ServiceCollection().AddLogging().AddInfrastructure(settings).BuildServiceProvider();
        var identity = provider.GetRequiredService<IOptions<IdentityOptions>>().Value;
        Assert.True(identity.Password.RequireUppercase);
        Assert.True(identity.Password.RequireLowercase);
        Assert.True(identity.Password.RequireDigit);
        Assert.True(identity.Password.RequireNonAlphanumeric);
        var hasher = provider.GetRequiredService<IPasswordHasher<ApplicationUser>>();
        var user = ApplicationUser.Create("author@example.test", "author@example.test", "Author");
        var encoded = hasher.HashPassword(user, "StrongPass123!");
        var bytes = Convert.FromBase64String(encoded);
        Assert.Equal(0x01, bytes[0]); // Identity V3 format
        Assert.Equal(2, BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(1, 4))); // HMACSHA512
        Assert.True(BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(5, 4)) >= 100_000);
        Assert.Equal(PasswordVerificationResult.Success,
            hasher.VerifyHashedPassword(user, encoded, "StrongPass123!"));
        Assert.Equal(PasswordVerificationResult.Failed,
            hasher.VerifyHashedPassword(user, encoded, "wrong"));
    }

    [Fact]
    public void Jwt_and_refresh_token_have_required_claims_lifetime_entropy_and_hash()
    {
        var service = new JwtService(Options.Create(new JwtSettings
        {
            Key = new string('k', 64),
            Issuer = "CulinaryBlog", Audience = "CulinaryBlogWeb",
            AccessTokenDurationInMinutes = 15
        }), TimeProvider.System);
        var user = ApplicationUser.Create("author@example.test", "author@example.test", "Author");
        var before = DateTime.UtcNow;
        var (encoded, expiresAt) = service.GenerateAccessToken(user, ["Author"]);
        var token = new JwtSecurityTokenHandler().ReadJwtToken(encoded);
        Assert.Equal("HS256", token.Header.Alg);
        Assert.Equal(user.Id, token.Claims.Single(c => c.Type == "userId").Value);
        Assert.Equal(user.Email, token.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Email).Value);
        Assert.Contains(token.Claims, c => c.Type == "roles" && c.Value == "Author");
        Assert.True(Guid.TryParse(token.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Jti).Value, out _));
        Assert.InRange(expiresAt, before.AddMinutes(15).AddSeconds(-1), DateTime.UtcNow.AddMinutes(15));
        Assert.Equal(token.ValidTo, expiresAt);

        var (raw, hash) = service.GenerateRefreshToken();
        Assert.Equal(64, Convert.FromBase64String(raw).Length); // 512 random bits
        Assert.Equal(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant(), hash);
        Assert.NotEqual(raw, hash);
        Assert.NotEqual(raw, service.GenerateRefreshToken().RawToken);
    }

    [Theory]
    [InlineData("https://frontend.example.test", null, true)]
    [InlineData("https://evil.example.test", null, false)]
    [InlineData("https://frontend.example.test", "cross-site", false)]
    [InlineData(null, "cross-site", false)]
    [InlineData(null, null, false)]
    public void Refresh_cookie_rejects_untrusted_origin_and_cross_site_fetch(
        string? origin, string? fetchSite, bool allowed)
    {
        var context = new DefaultHttpContext();
        context.Request.Scheme = "https";
        context.Request.Host = new HostString("api.example.test");
        context.Request.Headers.Cookie = "culinary_refresh_token=opaque-test-token";
        if (origin is not null) context.Request.Headers.Origin = origin;
        if (fetchSite is not null) context.Request.Headers["Sec-Fetch-Site"] = fetchSite;
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Cors:AllowedOrigins:0"] = "https://frontend.example.test"
        }).Build();
        if (allowed) RefreshCookieOriginGuard.EnsureAllowed(context, config);
        else Assert.Throws<ForbiddenException>(() => RefreshCookieOriginGuard.EnsureAllowed(context, config));
    }
}
