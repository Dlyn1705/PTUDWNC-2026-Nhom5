using System.Net.Http.Json;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Services.Email;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;

namespace CulinaryBlog.WelcomeEmail.Tests;

// Each integration test owns a migrated PostgreSQL database; never use the application database.
internal sealed class TestApp(WebApplication app, string connectionString, string adminConnection, string database) : IAsyncDisposable
{
    public WebApplication App => app;
    public IServiceProvider Services => app.Services;
    public HttpClient Client => app.GetTestClient();
    public TestClock Clock => Services.GetRequiredService<TestClock>();
    public WelcomeEmailOptions Options => Services.GetRequiredService<IOptions<WelcomeEmailOptions>>().Value;
    public T Get<T>() where T : notnull => Services.GetRequiredService<T>();

    public static async Task<TestApp> CreateAsync(bool worker = false, IEmailService? transport = null)
    {
        var configured = Environment.GetEnvironmentVariable("WELCOME_EMAIL_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set WELCOME_EMAIL_TEST_CONNECTION to a local PostgreSQL admin connection; tests create/drop isolated databases.");
        var admin = new NpgsqlConnectionStringBuilder(configured) { Database = "postgres" };
        if (admin.Host is not ("localhost" or "127.0.0.1")) throw new InvalidOperationException("Integration tests require local PostgreSQL.");
        var database = "fr_job001_test_" + Guid.NewGuid().ToString("N");
        await using (var connection = new NpgsqlConnection(admin.ConnectionString))
        {
            await connection.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", connection);
            await create.ExecuteNonQueryAsync();
        }
        var cs = new NpgsqlConnectionStringBuilder(admin.ConnectionString) { Database = database }.ConnectionString;
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = cs,
            ["Jwt:Key"] = "only-for-isolated-welcome-tests-32-characters-long",
            ["Jwt:Issuer"] = "welcome-tests", ["Jwt:Audience"] = "welcome-tests",
            ["Minio:AccessKey"] = "test-only", ["Minio:SecretKey"] = "test-only",
            ["Email:Enabled"] = "true", ["Email:Host"] = "127.0.0.1", ["Email:Port"] = "1025",
            ["Email:SecurityMode"] = "None", ["Email:PublicWebBaseUrl"] = "http://localhost:3000"
        });
        builder.Services.AddApplication().AddInfrastructure(builder.Configuration);
        builder.Services.AddAuthentication().AddCookie();
        builder.Services.AddRateLimiter(options => options.AddConcurrencyLimiter("auth", policy => policy.PermitLimit = 100));
        builder.Services.AddSingleton<TestClock>();
        builder.Services.AddSingleton<TimeProvider>(sp => sp.GetRequiredService<TestClock>());
        if (transport is not null) builder.Services.AddSingleton(transport);
        builder.Services.AddHangfire(config => config.UsePostgreSqlStorage(options => options.UseNpgsqlConnection(cs)));
        if (worker) builder.Services.AddHangfireServer(options => { options.WorkerCount = 1; options.SchedulePollingInterval = TimeSpan.FromSeconds(1); });
        var app = builder.Build();
        app.UseMiddleware<GlobalExceptionMiddleware>();
        app.UseRateLimiter(); app.UseAuthentication(); app.UseAuthorization();
        app.MapGroup("/api/v1").MapAuthEndpoints();
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
        await app.StartAsync();
        return new TestApp(app, cs, admin.ConnectionString, database);
    }

    public async Task<WelcomeEmailDelivery> RegisterAsync(string? email = null)
    {
        email ??= Guid.NewGuid().ToString("N") + "@welcome.test";
        using var response = await Client.PostAsJsonAsync("/api/v1/auth/register", new { Email = email, DisplayName = "Bếp Việt <script>alert(1)</script>", Password = "Test-Only!1234", ConfirmPassword = "Test-Only!1234" });
        Xunit.Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        Xunit.Assert.Contains(response.Headers.GetValues("Set-Cookie"), value => value.Contains("culinary_refresh_token=") && value.Contains("httponly", StringComparison.OrdinalIgnoreCase));
        return await Db(db => db.WelcomeEmailDeliveries.AsNoTracking().SingleAsync(x => x.RecipientEmail == email));
    }

    public async Task<T> Db<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }
    public Task<WelcomeEmailDelivery> Delivery(Guid id) => Db(db => db.WelcomeEmailDeliveries.AsNoTracking().SingleAsync(x => x.Id == id));
    public async Task WaitForAsync(Func<Task<bool>> condition)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        while (!await condition()) await Task.Delay(100, deadline.Token);
    }
    public async ValueTask DisposeAsync()
    {
        await app.StopAsync(); await app.DisposeAsync();
        // Stop worker and release this pool before dropping only the generated test database.
        await using var pool = new NpgsqlConnection(connectionString);
        NpgsqlConnection.ClearPool(pool);
        await using var connection = new NpgsqlConnection(adminConnection);
        await connection.OpenAsync();
        await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", connection);
        await drop.ExecuteNonQueryAsync();
    }
}

internal sealed class TestClock : TimeProvider
{
    private DateTimeOffset current = DateTimeOffset.UtcNow.AddSeconds(2);
    public override DateTimeOffset GetUtcNow() => current;
    public void Advance(int seconds) => current = current.AddSeconds(seconds);
}

internal sealed class RecordingEmail : IEmailService
{
    public int Calls;
    public bool Fail;
    public TaskCompletionSource? Gate;
    public TaskCompletionSource Entered = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public async Task SendWelcomeEmailAsync(string toEmail, string userName, CancellationToken ct = default)
    {
        Interlocked.Increment(ref Calls); Entered.TrySetResult();
        if (Gate is not null) await Gate.Task.WaitAsync(ct);
        if (Fail) throw new InvalidOperationException("raw SMTP error containing recipient/private password must not escape");
    }
}
