using System.Diagnostics.Metrics;

namespace CulinaryBlog.Application.Common.Metrics;

public static class DiagnosticsConfig
{
    public const string ServiceName = "CulinaryBlog.API";
    public const string MeterName = "CulinaryBlog.Domain.Metrics";
    
    public static readonly Meter Meter = new(MeterName, "1.0.0");

    public static readonly Counter<long> RecipeCreatedCounter = Meter.CreateCounter<long>(
        "recipe.created",
        description: "Number of recipes created");

    public static readonly Counter<long> RecipePublishedCounter = Meter.CreateCounter<long>(
        "recipe.published",
        description: "Number of recipes published");
}
