using System.Diagnostics.Metrics;

namespace CulinaryBlog.Infrastructure.Services;

public static class PerformanceMetrics
{
    public const string MeterName = "CulinaryBlog.Performance";
    public static readonly Meter Meter = new(MeterName, "1.0.0");
    public static readonly Counter<long> CacheReads = Meter.CreateCounter<long>("public.cache.reads");
    public static readonly Counter<long> CacheWritesFailed = Meter.CreateCounter<long>("public.cache.write.errors");
    public static readonly Histogram<double> SqlDuration = Meter.CreateHistogram<double>("db.command.duration", "ms");
}
