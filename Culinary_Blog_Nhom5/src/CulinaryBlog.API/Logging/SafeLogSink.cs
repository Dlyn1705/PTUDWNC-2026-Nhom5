using Serilog.Core;
using Serilog.Events;

namespace CulinaryBlog.API.Logging;

/// <summary>Only approved diagnostic fields reach console/Seq, including framework events.</summary>
public sealed class SafeLogSink(Logger output) : ILogEventSink, IDisposable
{
    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        "Attempt", "ErrorCategory",
        "EventType", "CorrelationId", "RequestId", "RequestPath", "RequestMethod", "StatusCode",
        "Elapsed", "UserId", "SourceContext", "Application", "Environment", "RequestName", "Outcome",
        "EmailMessageId", "JobId", "Attempt", "DeliveryStatus", "ErrorCategory",
        "TraceId", "SpanId", "RecipeId", "RecipeImageId", "ImageId", "Count", "EventId", "ExceptionType",
        "Method", "Path", "OccurredAtUtc" // RequestAuditMiddleware on main uses these diagnostic fields.
    };

    public void Emit(LogEvent logEvent)
    {
        var properties = logEvent.Properties.Select(p => new LogEventProperty(p.Key,
            Allowed.Contains(p.Key) ? SafeValue(p.Key, p.Value) : new ScalarValue("[REDACTED]"))).ToList();
        // Never retain free-form message literals or exception stacks. Values in approved
        // structured fields carry diagnostics; unknown fields remain visibly redacted.
        properties.RemoveAll(p => p.Name == "ExceptionStackTrace");
        if (logEvent.Exception is { } exception)
        {
            properties.RemoveAll(p => p.Name == "ExceptionType");
            properties.Add(new LogEventProperty("ExceptionType", new ScalarValue(exception.GetType().FullName)));
        }
        var parser = new Serilog.Parsing.MessageTemplateParser();
        var template = parser.Parse("Diagnostic event {EventType}");
        output.Write(new LogEvent(logEvent.Timestamp, logEvent.Level, null, template,
            properties, logEvent.TraceId ?? default, logEvent.SpanId ?? default));
    }

    public void Dispose() => output.Dispose();

    private static LogEventPropertyValue SafeValue(string key, LogEventPropertyValue value)
    {
        if (value is not ScalarValue scalar) return new ScalarValue("[REDACTED]");
        if (scalar.Value is not string text) return value;
        if (key is "RequestPath" or "Path")
        {
            text = text.Split('?', '#')[0];
            return new ScalarValue(text.Length <= 512 && text.StartsWith('/') && !text.Contains('@') && !text.Contains('\\')
                && !text.Any(char.IsControl) ? text : "[REDACTED]");
        }
        return new ScalarValue(text.Length <= 256 && text.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '_' or '-' or '+' or '`')
            ? text : "[REDACTED]");
    }
}
