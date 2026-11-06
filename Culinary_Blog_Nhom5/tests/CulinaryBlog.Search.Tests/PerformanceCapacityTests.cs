using CulinaryBlog.API.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace CulinaryBlog.Search.Tests;

public sealed class PerformanceCapacityTests
{
    [Fact]
    public void Production_cannot_enable_capacity_override()
    {
        var services = new ServiceCollection();
        Assert.Throws<InvalidOperationException>(() => services.AddPerformanceCapacity(Config(true), new TestEnvironment("Production")));
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, true)]
    public async Task Default_quota_is_preserved_and_override_requires_opt_in(bool enabled, bool expected)
    {
        var services = new ServiceCollection().AddLogging();
        services.AddApiSecurity(enabled); services.AddPerformanceCapacity(Config(enabled), new TestEnvironment("Performance"));
        await using var provider = services.BuildServiceProvider();
        using var limiter = provider.GetRequiredService<IOptions<RateLimiterOptions>>().Value.GlobalLimiter!;
        var context = new DefaultHttpContext(); context.Request.Path = "/api/v1/recipes";
        for (var i = 0; i < 100; i++) { using var lease = await limiter.AcquireAsync(context); Assert.True(lease.IsAcquired); }
        using var last = await limiter.AcquireAsync(context);
        Assert.Equal(expected, last.IsAcquired);
    }

    private static IConfiguration Config(bool enabled) => new ConfigurationBuilder().AddInMemoryCollection(
        new Dictionary<string, string?> { ["Performance:CapacityMode"] = enabled.ToString() }).Build();
    private sealed class TestEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
