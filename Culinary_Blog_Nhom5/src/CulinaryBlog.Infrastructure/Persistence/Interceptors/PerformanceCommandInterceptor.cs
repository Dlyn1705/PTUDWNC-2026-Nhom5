using System.Data.Common;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;

namespace CulinaryBlog.Infrastructure.Persistence.Interceptors;

// Never records SQL text or parameter values: even command text can contain literals.
public sealed class PerformanceCommandInterceptor(ILogger<PerformanceCommandInterceptor> logger) : DbCommandInterceptor
{
    private void Record(DbCommand command, CommandExecutedEventData data)
    {
        var ms = data.Duration.TotalMilliseconds;
        PerformanceMetrics.SqlDuration.Record(ms, new KeyValuePair<string, object?>("db.operation", data.ExecuteMethod.ToString()));
        if (ms > 100)
        {
            using var scope = logger.BeginScope(new Dictionary<string, object?> { ["EventType"] = "SlowSqlCommand" });
            logger.LogWarning("Slow SQL command {SqlFingerprint} took {Elapsed} ms; trace {TraceId}",
                Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(command.CommandText)))[..16],
                ms, Activity.Current?.TraceId.ToHexString());
        }
    }

    public override DbDataReader ReaderExecuted(DbCommand command, CommandExecutedEventData eventData, DbDataReader result)
    { Record(command, eventData); return result; }
    public override ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
        DbDataReader result, CancellationToken cancellationToken = default)
    { Record(command, eventData); return ValueTask.FromResult(result); }
    public override int NonQueryExecuted(DbCommand command, CommandExecutedEventData eventData, int result)
    { Record(command, eventData); return result; }
    public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
        int result, CancellationToken cancellationToken = default)
    { Record(command, eventData); return ValueTask.FromResult(result); }
    public override object? ScalarExecuted(DbCommand command, CommandExecutedEventData eventData, object? result)
    { Record(command, eventData); return result; }
    public override ValueTask<object?> ScalarExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
        object? result, CancellationToken cancellationToken = default)
    { Record(command, eventData); return ValueTask.FromResult(result); }
}
