namespace CulinaryBlog.Infrastructure.Services.Jobs;

/// <summary>One initial attempt plus at most three retries, with a twofold backoff.</summary>
public static class BackgroundJobRetryPolicy
{
    public const int RetryCount = 3;
    public const int MaximumAttempts = RetryCount + 1;
    public const int FirstDelaySeconds = 60;
    public const int SecondDelaySeconds = FirstDelaySeconds * 2;
    public const int ThirdDelaySeconds = SecondDelaySeconds * 2;
    public static int[] Delays => [FirstDelaySeconds, SecondDelaySeconds, ThirdDelaySeconds];
    public static int DelayAfter(int attempt) => Delays[Math.Clamp(attempt - 1, 0, RetryCount - 1)];
}
