using Serilog.Core;
using Serilog.Events;

namespace CulinaryBlog.API.Logging;

/// <summary>Only approved diagnostic fields reach console/Seq, including framework events.</summary>
public sealed class SafeLogSink(Logger output) : ILogEventSink, IDisposable
{
    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        "EventType", "CorrelationId", "RequestId", "RequestPath", "RequestMethod", "StatusCode",
        "Elapsed", "UserId", "SourceContext", "Application", "Environment", "RequestName", "Outcome",
        "TraceId", "SpanId", "RecipeId", "RecipeImageId", "ImageId", "Count", "EventId", "ExceptionType",
        "Method", "Path", "OccurredAtUtc" // RequestAuditMiddleware on main uses these diagnostic fields.
    };

    public void Emit(LogEvent logEvent)
    {
        var properties = logEvent.Properties.Select(p => new LogEventProperty(p.Key,
            Allowed.Contains(p.Key) ? p.Value : new ScalarValue("[REDACTED]"))).ToList();
        // Messages, Data and inner exception messages may contain credentials or SQL values.
        var isCompletion = logEvent.Properties.TryGetValue("EventType", out var eventType)
            && eventType is ScalarValue { Value: "HttpRequestCompleted" };
        if (logEvent.Exception is { } exception && !isCompletion)
        {
            properties.RemoveAll(p => p.Name is "ExceptionType" or "ExceptionStackTrace");
            properties.Add(new LogEventProperty("ExceptionType", new ScalarValue(exception.GetType().FullName)));
            properties.Add(new LogEventProperty("ExceptionStackTrace", new ScalarValue(exception.StackTrace)));
        }
        output.Write(new LogEvent(logEvent.Timestamp, logEvent.Level, null, logEvent.MessageTemplate,
            properties, logEvent.TraceId ?? default, logEvent.SpanId ?? default));
    }

    public void Dispose() => output.Dispose();
}
