using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Persistence.Interceptors;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Xunit;

namespace CulinaryBlog.Search.Tests;

public sealed class SlowSqlTests
{
    [Fact]
    public async Task Slow_database_command_emits_duration_and_fingerprint_without_sql_or_parameters()
    {
        var connection = Environment.GetEnvironmentVariable("SEARCH_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set SEARCH_TEST_CONNECTION to an isolated test PostgreSQL server");
        var logger = new CaptureLogger();
        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connection).AddInterceptors(new PerformanceCommandInterceptor(logger)).Options);
        await db.Database.ExecuteSqlRawAsync("SELECT pg_sleep(0.12)");
        var entry = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.True((double)entry.Values["Elapsed"]! > 100);
        Assert.Matches("^[A-F0-9]{16}$", (string)entry.Values["SqlFingerprint"]!);
        Assert.DoesNotContain("pg_sleep", string.Join(" ", entry.Values.Values));
        Assert.DoesNotContain("Password", string.Join(" ", entry.Values.Values));
    }

    private sealed class CaptureLogger : ILogger<PerformanceCommandInterceptor>
    {
        public List<(LogLevel Level, Dictionary<string, object?> Values)> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Entries.Add((logLevel, ((IEnumerable<KeyValuePair<string, object?>>)state!).ToDictionary(p => p.Key, p => p.Value)));
        }
    }
}
