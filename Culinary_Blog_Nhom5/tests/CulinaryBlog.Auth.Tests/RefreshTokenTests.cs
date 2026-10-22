using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xunit;

namespace CulinaryBlog.Auth.Tests;

public sealed class RefreshTokenTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    private async Task<AuthResponseDto> NewSession()
    {
        using var scope = fixture.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IAuthService>()
            .RegisterAsync($"{Guid.NewGuid():N}@example.test", "Test Author", "SecurePass123!", default);
    }

    private Task<HttpResponseMessage> Refresh(string? token) => fixture.Client.PostAsJsonAsync(
        "/api/v1/auth/refresh", new { refreshToken = token });

    private static string Cookie(HttpResponseMessage response) => Uri.UnescapeDataString(response.Headers
        .GetValues("Set-Cookie").Single(value => value.StartsWith("culinary_refresh_token="))
        .Split(';')[0]["culinary_refresh_token=".Length..]);

    private Task<List<RefreshToken>> Tokens(string userId) => fixture.WithDb(db =>
        db.RefreshTokens.AsNoTracking().Where(t => t.UserId == userId).OrderBy(t => t.CreatedAt).ToListAsync());

    [Fact]
    public async Task HttpLoginKeepsRefreshTokenOutOfPublicJsonAndItsCookieCanBeRotated()
    {
        var login = await NewSession();
        var response = await fixture.Client.PostAsJsonAsync("/api/v1/auth/login",
            new { email = login.User.Email, password = "SecurePass123!" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data");
        Assert.False(body.TryGetProperty("refreshToken", out _));
        Assert.Equal(login.User.Id, body.GetProperty("user").GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.OK, (await Refresh(Cookie(response))).StatusCode);
    }

    [Fact]
    public async Task ExpiredAccessTokenCanRefreshWithoutBearerAndRotateBothTokens()
    {
        fixture.Clock.FixedUtcNow = DateTimeOffset.UtcNow.AddMinutes(-16);
        AuthResponseDto login;
        try { login = await NewSession(); }
        finally { fixture.Clock.FixedUtcNow = null; }
        using var protectedRequest = new HttpRequestMessage(HttpMethod.Get, "/protected");
        protectedRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fixture.Client.SendAsync(protectedRequest)).StatusCode);

        var before = DateTime.UtcNow;
        var response = await Refresh(login.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data");
        Assert.False(body.TryGetProperty("refreshToken", out _));
        var accessToken = body.GetProperty("accessToken").GetString()!;
        Assert.NotEqual(login.AccessToken, accessToken);
        Assert.Equal(new JwtSecurityTokenHandler().ReadJwtToken(accessToken).ValidTo,
            body.GetProperty("accessTokenExpiry").GetDateTime());
        Assert.InRange(body.GetProperty("accessTokenExpiry").GetDateTime(), before.AddMinutes(15).AddSeconds(-1), DateTime.UtcNow.AddMinutes(15));
        var rotated = Cookie(response);
        Assert.NotEqual(login.RefreshToken, rotated);
        var tokens = await Tokens(login.User.Id);
        var old = Assert.Single(tokens, t => t.IsUsed);
        var current = Assert.Single(tokens, t => !t.IsUsed);
        Assert.True(old.IsRevoked);
        Assert.True(current.IsActive);
        Assert.Equal(current.TokenHash, old.ReplacedByTokenHash);
        Assert.InRange(current.ExpiresAt, before.AddDays(7), DateTime.UtcNow.AddDays(7));
        Assert.DoesNotContain(login.RefreshToken, string.Join(',', tokens.Select(t => t.TokenHash)));
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        var cookieHeader = response.Headers.GetValues("Set-Cookie").Single();
        Assert.Contains("httponly", cookieHeader.ToLowerInvariant());
        Assert.Contains("secure", cookieHeader.ToLowerInvariant());
        Assert.Contains("samesite=lax", cookieHeader.ToLowerInvariant());
        Assert.Contains("path=/api/v1/auth", cookieHeader);
        using var validRequest = new HttpRequestMessage(HttpMethod.Get, "/protected");
        validRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        Assert.Equal(HttpStatusCode.OK, (await fixture.Client.SendAsync(validRequest)).StatusCode);
    }

    [Fact]
    public async Task ReuseRevokesDescendantsAndOtherActiveSessions()
    {
        var login = await NewSession();
        var r1 = Cookie(await Refresh(login.RefreshToken));
        var r2 = Cookie(await Refresh(r1));
        var other = new RefreshToken { UserId = login.User.Id, TokenHash = new string('f', 64), ExpiresAt = DateTime.UtcNow.AddDays(7) };
        await fixture.WithDb(async db => { db.Add(other); return await db.SaveChangesAsync(); });
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(login.RefreshToken)).StatusCode);
        Assert.All(await Tokens(login.User.Id), token => Assert.True(token.IsRevoked));
        Assert.False((await Tokens(login.User.Id)).Single(t => t.Id == other.Id).IsUsed);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(r2)).StatusCode);
    }

    [Fact]
    public async Task ExpiredUsedTokenStillTriggersReuseRevocation()
    {
        var login = await NewSession();
        await Refresh(login.RefreshToken);
        await fixture.WithDb(db => db.RefreshTokens.Where(t => t.UserId == login.User.Id && t.IsUsed)
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.ExpiresAt, DateTime.UtcNow.AddDays(-1))));
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(login.RefreshToken)).StatusCode);
        Assert.All(await Tokens(login.User.Id), token => Assert.True(token.IsRevoked));
    }

    [Fact]
    public async Task RefreshUsesCurrentRolesFromDatabase()
    {
        var login = await NewSession();
        using var scope = fixture.Services.CreateScope();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        if (!await roles.RoleExistsAsync("Admin")) await roles.CreateAsync(new IdentityRole("Admin"));
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await users.AddToRoleAsync((await users.FindByIdAsync(login.User.Id))!, "Admin");
        var response = await Refresh(login.RefreshToken);
        var body = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("data");
        Assert.Contains(body.GetProperty("roles").EnumerateArray(), role => role.GetString() == "Admin");
    }

    [Fact]
    public async Task GoogleLinkedAccountCanRefreshWithoutPassword()
    {
        var login = await NewSession();
        using var scope = fixture.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = (await users.FindByIdAsync(login.User.Id))!;
        Assert.True((await users.AddLoginAsync(user,
            new UserLoginInfo("Google", Guid.NewGuid().ToString(), "Google"))).Succeeded);
        Assert.True((await users.RemovePasswordAsync(user)).Succeeded);
        Assert.False(await users.HasPasswordAsync(user));
        Assert.Equal(HttpStatusCode.OK, (await Refresh(login.RefreshToken)).StatusCode);
        Assert.Single(await Tokens(login.User.Id), token => token.IsUsed && token.IsRevoked);
    }

    [Theory]
    [InlineData("used")]
    [InlineData("replaced")]
    [InlineData("revoked")]
    public async Task InvalidStateAloneTriggersReuseDetection(string state)
    {
        var login = await NewSession();
        await fixture.WithDb(async db =>
        {
            var token = await db.RefreshTokens.SingleAsync(t => t.UserId == login.User.Id);
            token.IsUsed = state == "used";
            token.ReplacedByTokenHash = state == "replaced" ? new string('a', 64) : null;
            token.RevokedAt = state == "revoked" ? DateTime.UtcNow : null;
            return await db.SaveChangesAsync();
        });
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(login.RefreshToken)).StatusCode);
        Assert.All(await Tokens(login.User.Id), token => Assert.True(token.IsRevoked));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("unknown-token")]
    public async Task InvalidOrMissingTokenDoesNotRevokeAnotherUser(string? token)
    {
        var login = await NewSession();
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(token)).StatusCode);
        Assert.True(Assert.Single(await Tokens(login.User.Id)).IsActive);
    }

    [Fact]
    public async Task ExactExpiryBoundaryIsRejected()
    {
        var login = await NewSession();
        var expiredAt = DateTime.UtcNow;
        await fixture.WithDb(db => db.RefreshTokens.Where(t => t.UserId == login.User.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.ExpiresAt, expiredAt)));
        fixture.Clock.FixedUtcNow = new DateTimeOffset(expiredAt);
        try { Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(login.RefreshToken)).StatusCode); }
        finally { fixture.Clock.FixedUtcNow = null; }
        Assert.False(Assert.Single(await Tokens(login.User.Id)).IsUsed);
    }

    [Theory]
    [InlineData(false, false, 401)]
    [InlineData(true, true, 423)]
    public async Task InactiveAndIdentityLockedUsersCannotRefresh(bool active, bool locked, int status)
    {
        var login = await NewSession();
        await fixture.WithDb(db => db.Users.Where(u => u.Id == login.User.Id).ExecuteUpdateAsync(set => set
            .SetProperty(u => u.IsActive, active).SetProperty(u => u.LockoutEnabled, locked)
            .SetProperty(u => u.LockoutEnd, locked ? DateTimeOffset.UtcNow.AddMinutes(15) : (DateTimeOffset?)null)));
        var response = await Refresh(login.RefreshToken);
        Assert.Equal(status, (int)response.StatusCode);
        Assert.All(await Tokens(login.User.Id), token => Assert.True(token.IsRevoked));
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), cookie => cookie.Contains("expires=Thu, 01 Jan 1970"));
    }

    [Fact]
    public async Task DeletedUserCannotRefresh()
    {
        var login = await NewSession();
        await fixture.WithDb(db => db.Users.Where(u => u.Id == login.User.Id).ExecuteDeleteAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(login.RefreshToken)).StatusCode);
        Assert.Empty(await Tokens(login.User.Id));
    }

    [Fact]
    public async Task TwoConcurrentRefreshRequestsConsumeTokenOnlyOnce()
    {
        var login = await NewSession();
        var responses = await Task.WhenAll(Refresh(login.RefreshToken), Refresh(login.RefreshToken));
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Unauthorized);
        var tokens = await Tokens(login.User.Id);
        Assert.Equal(2, tokens.Count);
        Assert.All(tokens, token => Assert.True(token.IsRevoked));
        Assert.Single(tokens, token => token.IsUsed);
    }

    [Fact]
    public async Task ReplayRacingDescendantRefreshLeavesNoActiveDescendant()
    {
        var login = await NewSession();
        var next = Cookie(await Refresh(login.RefreshToken));
        var responses = await Task.WhenAll(Refresh(next), Refresh(login.RefreshToken));
        Assert.Equal(HttpStatusCode.Unauthorized, responses[1].StatusCode);
        Assert.All(await Tokens(login.User.Id), token => Assert.True(token.IsRevoked));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task FailureBeforeCommitDoesNotConsumeToken(bool insertFailure)
    {
        var login = await NewSession();
        fixture.Failures.FailNextInsert = insertFailure;
        fixture.Failures.FailNextSigning = !insertFailure;
        Assert.Equal(HttpStatusCode.InternalServerError, (await Refresh(login.RefreshToken)).StatusCode);
        Assert.True(Assert.Single(await Tokens(login.User.Id)).IsActive);
        Assert.Equal(HttpStatusCode.OK, (await Refresh(login.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task LostCommitAcknowledgementRecoversSameRotationWithoutTreatingItAsReplay()
    {
        var login = await NewSession();
        fixture.CommitFailures.FailAfterNextCommit = true;
        var response = await Refresh(login.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var tokens = await Tokens(login.User.Id);
        Assert.Equal(2, tokens.Count);
        Assert.Single(tokens, token => token.IsActive);
        Assert.Single(tokens, token => token.IsUsed && token.IsRevoked);
    }

    [Fact]
    public async Task LogoutWithOldTokenRevokesSuccessorWithCurrentAccessToken()
    {
        var login = await NewSession();
        var next = Cookie(await Refresh(login.RefreshToken));
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/logout")
        {
            Content = JsonContent.Create(new { refreshToken = login.RefreshToken })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        var response = await fixture.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.All(await Tokens(login.User.Id), token => Assert.True(token.IsRevoked));
        Assert.False((await Tokens(login.User.Id)).Single(t => !t.IsUsed).IsUsed);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(next)).StatusCode);
    }

    [Fact]
    public async Task CookieTakesPrecedenceOverBodyAndMalformedJsonIs400()
    {
        var login = await NewSession();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/refresh")
        {
            Content = JsonContent.Create(new { refreshToken = "invalid-body-token" })
        };
        request.Headers.Add("Cookie", $"culinary_refresh_token={Uri.EscapeDataString(login.RefreshToken)}");
        Assert.Equal(HttpStatusCode.OK, (await fixture.Client.SendAsync(request)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await fixture.Client.PostAsync("/api/v1/auth/refresh",
            new StringContent("{bad-json", Encoding.UTF8, "application/json"))).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Refresh(new string('x', 257))).StatusCode);
    }

    [Fact]
    public Task LatestMigrationModelMatchesCurrentSnapshot() => fixture.WithDb(db =>
    {
        var migrations = db.GetService<IMigrationsAssembly>();
        var latest = migrations.Migrations.OrderBy(entry => entry.Key, StringComparer.Ordinal).Last();
        var migration = migrations.CreateMigration(latest.Value, db.Database.ProviderName!);
        var initializer = db.GetService<IModelRuntimeInitializer>();
        var snapshot = initializer.Initialize(migrations.ModelSnapshot!.Model, designTime: true);
        var target = initializer.Initialize(migration.TargetModel, designTime: true);
        var differences = db.GetService<IMigrationsModelDiffer>()
            .GetDifferences(snapshot.GetRelationalModel(), target.GetRelationalModel());
        Assert.Empty(differences);
        return Task.FromResult(true);
    });

    [Fact]
    public async Task UsageMigrationBackfillsOnlyRotatedTokens()
    {
        // Use another isolated database to exercise upgrade from the previous schema with real old rows.
        await fixture.WithIsolatedDatabase(async db =>
        {
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync("20260930103718_FixCurrentModel");
            var user = ApplicationUser.Create("migration@example.test", "migration@example.test", "Migration");
            db.Users.Add(user);
            await db.SaveChangesAsync();
            var now = DateTime.UtcNow;
            var expiresAt = now.AddDays(7);
            var rotatedHash = new string('a', 64);
            var logoutHash = new string('b', 64);
            var activeHash = new string('c', 64);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "RefreshTokens" ("Id", "UserId", "TokenHash", "CreatedAt", "ExpiresAt", "RevokedAt", "ReplacedByTokenHash")
                VALUES ({Guid.NewGuid()}, {user.Id}, {rotatedHash}, {now}, {expiresAt}, NULL, {activeHash}),
                       ({Guid.NewGuid()}, {user.Id}, {logoutHash}, {now}, {expiresAt}, {now}, NULL),
                       ({Guid.NewGuid()}, {user.Id}, {activeHash}, {now}, {expiresAt}, NULL, NULL)
                """);
            await migrator.MigrateAsync();
            var rows = await db.RefreshTokens.AsNoTracking().ToListAsync();
            var rotated = rows.Single(t => t.TokenHash == rotatedHash);
            Assert.True(rotated.IsUsed && rotated.IsRevoked);
            Assert.False(rows.Single(t => t.TokenHash == logoutHash).IsUsed);
            Assert.True(rows.Single(t => t.TokenHash == activeHash).IsActive);
        });
    }
}
