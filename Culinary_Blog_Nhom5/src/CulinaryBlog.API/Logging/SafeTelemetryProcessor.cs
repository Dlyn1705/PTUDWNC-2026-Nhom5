using System.Diagnostics;
using OpenTelemetry;

namespace CulinaryBlog.API.Logging;

/// <summary>Telemetry bypasses Serilog; remove payload-bearing attributes before every exporter.</summary>
public sealed class SafeTelemetryProcessor : BaseProcessor<Activity>
{
    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        "http.request.method", "http.method", "http.response.status_code", "http.status_code",
        "http.route", "db.system", "db.system.name", "db.operation.name", "db.operation",
        "network.protocol.version", "error.type", "correlation.id"
    };
    public override void OnEnd(Activity activity)
    {
        foreach (var tag in activity.TagObjects.ToArray())
            if (!Allowed.Contains(tag.Key)) activity.SetTag(tag.Key, null);
        // Activity has no supported removal API for events/links. Suppress spans
        // containing these unapproved payload containers rather than export secrets.
        if (activity.Events.Any() || activity.Links.Any())
            activity.ActivityTraceFlags &= ~ActivityTraceFlags.Recorded;
        activity.DisplayName = activity.Kind == ActivityKind.Server ? "HTTP request" : "Operation";
        activity.TraceStateString = null;
        activity.SetStatus(activity.Status); // clear potentially sensitive status description
    }
}
