using System.Diagnostics;
using CulinaryBlog.Application.Contracts;
using MediatR;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CulinaryBlog.Application.Common.Behaviors;

public class LoggingBehavior<TRequest, TResponse>(
    ILogger<LoggingBehavior<TRequest, TResponse>> logger,
    ICurrentUserService currentUser,
    IOptions<StructuredLoggingOptions> options) : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var requestName = typeof(TRequest).Name;
        using var userScope = logger.BeginScope(new Dictionary<string, object?>
        {
            ["UserId"] = currentUser.IsAuthenticated ? currentUser.UserId : null
        });
        var started = Stopwatch.GetTimestamp();
        var outcome = "Succeeded";
        var level = LogLevel.Information;
        try
        {
            return await next();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            outcome = "Canceled";
            level = LogLevel.Warning;
            throw;
        }
        catch (Exception exception)
        {
            outcome = "Failed";
            level = StructuredLoggingOptions.IsExpected(exception) ? LogLevel.Warning : LogLevel.Error;
            throw;
        }
        finally
        {
            var elapsed = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
            if (level == LogLevel.Information && options.Value.IsSlow(elapsed)) level = LogLevel.Warning;
            // The HTTP exception handler owns exception details. Never serialize command/response.
            using var completionScope = logger.BeginScope(new Dictionary<string, object?>
            {
                ["EventType"] = "ApplicationRequestCompleted"
            });
            logger.Log(level, "Application request {RequestName} {Outcome} in {Elapsed} ms",
                requestName, outcome, elapsed);
        }
    }
}
