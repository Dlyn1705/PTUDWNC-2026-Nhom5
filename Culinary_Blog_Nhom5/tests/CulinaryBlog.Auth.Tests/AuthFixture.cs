using System.Data.Common;
using System.Security.Claims;
using System.Text;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Settings;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Xunit;

namespace CulinaryBlog.Auth.Tests;

// Every run gets its own database; the development database is never migrated or cleared by these tests.
public sealed class AuthFixture : IAsyncLifetime
{
    private readonly string databaseName = $"culinary_auth_test_{Guid.NewGuid():N}";
    private readonly string adminConnection = Environment.GetEnvironmentVariable("AUTH_TEST_POSTGRES")
        ?? "Host=localhost;Port=5433;Database=postgres;Username=postgres;Password=Password123!";
    private WebApplication app = null!;
    public HttpClient Client { get; private set; } = null!;
    public TestClock Clock { get; } = new();
    public FailureInjection Failures { get; } = new();
    public CommitFailureInjection CommitFailures { get; } = new();
    public IServiceProvider Services => app.Services;

    public async Task InitializeAsync()
    {
        await using (var admin = new NpgsqlConnection(adminConnection))
        {
            await admin.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{databaseName}\"", admin);
            await create.ExecuteNonQueryAsync();
        }
        var connection = new NpgsqlConnectionStringBuilder(adminConnection) { Database = databaseName }.ToString();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = connection,
            ["Jwt:Key"] = "AuthTests_Only_An_Isolated_Development_Key_At_Least_64_Characters_Long",
            ["Jwt:Issuer"] = "CulinaryBlog", ["Jwt:Audience"] = "CulinaryBlogWeb",
            ["Jwt:AccessTokenDurationInMinutes"] = "15", ["Jwt:RefreshTokenDurationInDays"] = "7",
            ["Minio:AccessKey"] = "auth-tests-only", ["Minio:SecretKey"] = "auth-tests-only-secret"
        });
        builder.Services.AddApplication();
        builder.Services.AddInfrastructure(builder.Configuration);
        builder.Services.AddSingleton<TimeProvider>(Clock);
        builder.Services.AddDbContext<ApplicationDbContext>(options => options.AddInterceptors(Failures, CommitFailures));
        builder.Services.AddScoped<IJwtService, ControlledJwtService>();
        builder.Services.AddSingleton(Failures);
        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true, ValidIssuer = "CulinaryBlog",
                ValidateAudience = true, ValidAudience = "CulinaryBlogWeb",
                ValidateLifetime = true, ClockSkew = TimeSpan.Zero,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
            };
        });
        builder.Services.AddRateLimiter(options => options.AddPolicy("auth", _ =>
            System.Threading.RateLimiting.RateLimitPartition.GetNoLimiter("auth-tests")));
        app = builder.Build();
        app.UseMiddleware<GlobalExceptionMiddleware>();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapAuthEndpoints();
        app.MapGet("/protected", (ClaimsPrincipal user) => Results.Ok(user.Identity!.IsAuthenticated))
            .RequireAuthorization();
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
        await app.StartAsync();
        Client = app.GetTestClient();
        Client.BaseAddress = new Uri("https://localhost");
    }

    public async Task<T> WithDb<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = app.Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }

    public async Task WithIsolatedDatabase(Func<ApplicationDbContext, Task> action)
    {
        var name = $"culinary_auth_test_{Guid.NewGuid():N}";
        await using var admin = new NpgsqlConnection(adminConnection);
        await admin.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", admin))
            await create.ExecuteNonQueryAsync();
        try
        {
            var connection = new NpgsqlConnectionStringBuilder(adminConnection) { Database = name }.ToString();
            await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseNpgsql(connection).Options);
            await action(db);
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{name}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }

    public async Task DisposeAsync()
    {
        Client?.Dispose();
        if (app is not null) await app.DisposeAsync();
        await using var admin = new NpgsqlConnection(adminConnection);
        await admin.OpenAsync();
        await using var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{databaseName}\" WITH (FORCE)", admin);
        await drop.ExecuteNonQueryAsync();
    }
}

public sealed class TestClock : TimeProvider
{
    public DateTimeOffset? FixedUtcNow { get; set; }
    public override DateTimeOffset GetUtcNow() => FixedUtcNow ?? DateTimeOffset.UtcNow;
}

public sealed class FailureInjection : DbCommandInterceptor
{
    public bool FailNextInsert { get; set; }
    public bool FailNextSigning { get; set; }
    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        if (FailNextInsert && command.CommandText.Contains("INSERT INTO \"RefreshTokens\"", StringComparison.Ordinal))
        {
            FailNextInsert = false;
            throw new InvalidOperationException("Injected token insert failure.");
        }
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }
}

public sealed class CommitFailureInjection : DbTransactionInterceptor
{
    public bool FailAfterNextCommit { get; set; }
    public override Task TransactionCommittedAsync(DbTransaction transaction, TransactionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        if (FailAfterNextCommit)
        {
            FailAfterNextCommit = false;
            // The database committed, but the caller did not receive confirmation.
            throw new NpgsqlException("Injected lost commit acknowledgement.", new TimeoutException());
        }
        return Task.CompletedTask;
    }
}

public sealed class ControlledJwtService(IOptions<JwtSettings> options, TimeProvider clock, FailureInjection failures)
    : JwtService(options, clock), IJwtService
{
    (string Token, DateTime ExpiresAt) IJwtService.GenerateAccessToken(ApplicationUser user, IList<string> roles)
    {
        if (failures.FailNextSigning)
        {
            failures.FailNextSigning = false;
            throw new InvalidOperationException("Injected signing failure.");
        }
        return GenerateAccessToken(user, roles);
    }
}
