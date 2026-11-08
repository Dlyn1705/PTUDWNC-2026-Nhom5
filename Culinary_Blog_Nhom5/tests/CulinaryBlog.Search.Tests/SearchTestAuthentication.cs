using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CulinaryBlog.Search.Tests;

// Registered only inside TestServer; no authentication bypass exists in the application.
public sealed class SearchTestAuthentication(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.ContainsKey("X-Search-Test-Admin")) return Task.FromResult(AuthenticateResult.NoResult());
        var identity = new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, "owner"), new Claim(ClaimTypes.Role, "Admin")
        ], Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
