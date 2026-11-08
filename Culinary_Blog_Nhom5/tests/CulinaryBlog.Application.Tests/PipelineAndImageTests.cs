using CulinaryBlog.Application.Common.Behaviors;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Auth.Commands.Register;
using CulinaryBlog.Application.Features.Auth.Commands.Login;
using CulinaryBlog.Application.Features.Auth.Commands.GoogleIdTokenLogin;
using CulinaryBlog.Application.Features.Auth.Commands.Refresh;
using CulinaryBlog.Application.Features.Auth.Commands.Logout;
using CulinaryBlog.Application.Features.Recipes.Commands.UploadRecipeImage;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace CulinaryBlog.Application.Tests;

public sealed class PipelineAndImageTests
{
    [Fact]
    public async Task Validation_pipeline_stops_invalid_request_and_runs_valid_handler_once()
    {
        var behavior = new ValidationBehavior<RegisterCommand, int>([new RegisterCommandValidator()]);
        var request = new RegisterCommand("chef@example.test", "Chef", "Safe-Password1!", "Safe-Password1!");
        var calls = 0;
        Assert.Equal(42, await behavior.Handle(request, _ => { calls++; return Task.FromResult(42); }, default));
        await Assert.ThrowsAsync<CulinaryBlog.Domain.Exceptions.ValidationException>(() => behavior.Handle(request with { Email = "invalid" }, _ => { calls++; return Task.FromResult(42); }, default));
        Assert.Equal(1, calls);
        Assert.Equal(42, await new ValidationBehavior<RegisterCommand, int>([]).Handle(request, _ => Task.FromResult(42), default));
    }

    [Fact]
    public async Task Logging_pipeline_records_outcome_without_password_or_response_payload()
    {
        var logger = Substitute.For<ILogger<LoggingBehavior<RegisterCommand, string>>>();
        var user = Substitute.For<ICurrentUserService>(); user.IsAuthenticated.Returns(true); user.UserId.Returns("owner");
        var behavior = new LoggingBehavior<RegisterCommand, string>(logger, user, Options.Create(new StructuredLoggingOptions()));
        var input = new RegisterCommand("private@example.test", "Chef", "Never-log-password1!", "Never-log-password1!");
        Assert.Equal("private-response", await behavior.Handle(input, _ => Task.FromResult("private-response"), default));
        await Assert.ThrowsAsync<IOException>(() => behavior.Handle(input, _ => throw new IOException("private exception"), default));
        using var cancel = new CancellationTokenSource(); cancel.Cancel();
        await Assert.ThrowsAsync<OperationCanceledException>(() => behavior.Handle(input, _ => throw new OperationCanceledException(cancel.Token), cancel.Token));
        var logs = logger.ReceivedCalls().Where(x => x.GetMethodInfo().Name == "Log").Select(x => x.GetArguments()[2]!.ToString()).ToArray();
        Assert.Equal(3, logs.Length);
        Assert.Contains(logs, x => x!.Contains("Succeeded")); Assert.Contains(logs, x => x!.Contains("Failed")); Assert.Contains(logs, x => x!.Contains("Canceled"));
        Assert.All(logs, x => { Assert.DoesNotContain("private", x!); Assert.DoesNotContain("Never-log", x!); });
    }

    [Fact]
    public async Task Auth_handlers_forward_credentials_and_cancellation_to_contracts()
    {
        var auth = Substitute.For<IAuthService>(); using var cancel = new CancellationTokenSource(); var ct = cancel.Token;
        await new RegisterCommandHandler(auth).Handle(new("chef@example.test", "Chef", "Password1!", "Password1!"), ct);
        await new LoginCommandHandler(auth).Handle(new("chef@example.test", "Password1!"), ct);
        await new GoogleIdTokenLoginCommandHandler(auth).Handle(new("google-token"), ct);
        await new RefreshTokenCommandHandler(auth).Handle(new("refresh-token"), ct);
        await new LogoutCommandHandler(auth).Handle(new("refresh-token", "owner"), ct);
        await auth.Received(1).RegisterAsync("chef@example.test", "Chef", "Password1!", ct);
        await auth.Received(1).LoginAsync("chef@example.test", "Password1!", ct);
        await auth.Received(1).LoginWithGoogleIdTokenAsync("google-token", ct);
        await auth.Received(1).RefreshAsync("refresh-token", ct);
        await auth.Received(1).RevokeRefreshTokenAsync("refresh-token", "owner", ct);
    }

    [Theory]
    [InlineData("jpg", "image/jpeg", "FFD8FF00")]
    [InlineData("png", "image/png", "89504E470D0A1A0A")]
    [InlineData("webp", "image/webp", "524946460000000057454250")]
    [InlineData("avif", "image/avif", "000000186674797061766966")]
    public async Task Image_magic_bytes_must_match_extension_and_mime_and_leave_stream_rewound(string ext, string mime, string hex)
    {
        using var input = new MemoryStream(Convert.FromHexString(hex));
        var result = await ImageFileValidation.DetectAsync(input, "image." + ext, mime, default);
        Assert.Equal(ext, result.Extension); Assert.Equal(0, input.Position);
        await Assert.ThrowsAsync<CulinaryBlog.Domain.Exceptions.ValidationException>(() => ImageFileValidation.DetectAsync(input, "image.gif", mime, default));
        await Assert.ThrowsAsync<CulinaryBlog.Domain.Exceptions.ValidationException>(() => ImageFileValidation.DetectAsync(input, "../image." + ext, mime, default));
        using var invalid = new MemoryStream([1, 2, 3]);
        await Assert.ThrowsAsync<CulinaryBlog.Domain.Exceptions.ValidationException>(() => ImageFileValidation.DetectAsync(invalid, "image." + ext, mime, default));
    }
}
