using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace CulinaryBlog.Auth.Tests;

public sealed class HealthEndpointTests(AuthFixture fixture) : IClassFixture<AuthFixture>
{
    [Fact]
    public async Task LivenessProbeDoesNotRequireDependencies()
    {
        using var response = await fixture.Client.GetAsync("/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Healthy", body.GetProperty("status").GetString());
        Assert.Equal("liveness", body.GetProperty("probe").GetString());
    }

    [Fact]
    public async Task ReadinessChecksPostgresAndRedisWithoutDependingOnMinio()
    {
        using var response = await fixture.Client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Healthy", body.GetProperty("status").GetString());
        var dependencies = body.GetProperty("dependencies");
        Assert.Equal("Ready", dependencies.GetProperty("database").GetString());
        Assert.Equal("Ready", dependencies.GetProperty("redis").GetString());
        Assert.False(dependencies.TryGetProperty("storage", out _));
    }
}
