using CulinaryBlog.Domain.Exceptions;

namespace CulinaryBlog.Application.Common.Behaviors;

public sealed class StructuredLoggingOptions
{
    public const string SectionName = "Observability";
    public double SlowRequestThresholdMs { get; set; } = 1000;
    public bool IsSlow(double elapsedMs) => elapsedMs > SlowRequestThresholdMs;
    public static bool IsExpected(Exception exception) => exception is
        ValidationException or NotFoundException or ConflictException or ForbiddenException
        or UnauthorizedAccessException or LockedException;
}
