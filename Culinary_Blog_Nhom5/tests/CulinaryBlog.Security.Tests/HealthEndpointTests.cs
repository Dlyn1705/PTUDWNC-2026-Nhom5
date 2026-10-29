using System.Diagnostics;
using System.Net;
using System.Text.Json;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace CulinaryBlog.Security.Tests;

public sealed class HealthEndpointTests
{
    [Theory]
    [InlineData(true, true, true, HttpStatusCode.OK, HttpStatusCode.OK)]
    [InlineData(false, true, true, HttpStatusCode.ServiceUnavailable, HttpStatusCode.ServiceUnavailable)]
    [InlineData(true, false, true, HttpStatusCode.ServiceUnavailable, HttpStatusCode.ServiceUnavailable)]
    [InlineData(true, true, false, HttpStatusCode.OK, HttpStatusCode.ServiceUnavailable)]
    public async Task Readiness_depends_on_postgres_and_redis_but_liveness_only_on_process(
        bool database, bool redis, bool storage, HttpStatusCode readyStatus, HttpStatusCode overallStatus)
    {
        var probe = new FakeProbe
        {
            Database = _ => Task.FromResult(database),
            Redis = _ => Task.FromResult(redis),
            Storage = _ => Task.FromResult(storage)
        };
        await using var app = await CreateAsync(probe);
        using var client = app.GetTestClient();

        using var ready = await client.GetAsync("/health/ready");
        Assert.Equal(readyStatus, ready.StatusCode);
        Assert.Equal(0, probe.StorageCalls);
        using (var body = JsonDocument.Parse(await ready.Content.ReadAsStringAsync()))
        {
            Assert.Equal("readiness", body.RootElement.GetProperty("probe").GetString());
            var dependencies = body.RootElement.GetProperty("dependencies");
            Assert.Equal(database ? "Ready" : "Unavailable", dependencies.GetProperty("database").GetString());
            Assert.Equal(redis ? "Ready" : "Unavailable", dependencies.GetProperty("cache").GetString());
            Assert.False(dependencies.TryGetProperty("storage", out _));
        }

        using var full = await client.GetAsync("/health");
        Assert.Equal(overallStatus, full.StatusCode);
        Assert.Equal(storage ? "Ready" : "Unavailable",
            (await ReadJsonAsync(full)).GetProperty("dependencies").GetProperty("storage").GetString());
        using var live = await client.GetAsync("/health/live");
        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        Assert.Equal("liveness", (await ReadJsonAsync(live)).GetProperty("probe").GetString());
        Assert.Equal("no-store", live.Headers.CacheControl?.ToString());
    }

    [Fact]
    public async Task Dependency_exception_is_hidden_and_timeout_cancels_the_probe()
    {
        var cancelled = false;
        var probe = new FakeProbe
        {
            Database = async ct =>
            {
                try { await Task.Delay(Timeout.InfiniteTimeSpan, ct); }
                catch (OperationCanceledException) { cancelled = true; throw; }
                return true;
            },
            Redis = _ => throw new InvalidOperationException("redis://user:secret@internal:6379"),
            Storage = _ => throw new InvalidOperationException("http://minio-internal:9000?secret=credential")
        };
        await using var app = await CreateAsync(probe);
        using var client = app.GetTestClient();
        var clock = Stopwatch.StartNew();
        using var response = await client.GetAsync("/health");
        clock.Stop();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.True(clock.Elapsed < TimeSpan.FromSeconds(5));
        Assert.True(cancelled);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("secret", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("internal", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("6379", body, StringComparison.Ordinal);
        Assert.DoesNotContain("9000", body, StringComparison.Ordinal);
        using var live = await client.GetAsync("/health/live");
        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
    }

    [Fact]
    public async Task Production_probe_uses_database_connection_and_a_real_cache_command()
    {
        await using var database = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=missing;Username=missing;Password=missing;Timeout=1;Pooling=false")
            .Options);
        var cache = new FakeCache();
        using var services = new ServiceCollection()
            .AddSingleton<IFileStorageService>(new FakeStorage()).BuildServiceProvider();
        var probe = new HealthDependencyProbe(database, cache, services);
        Assert.False(await probe.DatabaseAsync(CancellationToken.None));
        Assert.True(await probe.RedisAsync(CancellationToken.None));
        Assert.Equal("health:probe", cache.LastKey);
        cache.ThrowOnGet = true;
        await Assert.ThrowsAsync<InvalidOperationException>(() => probe.RedisAsync(CancellationToken.None));
        Assert.True(await probe.StorageAsync(CancellationToken.None));
    }

    private static async Task<WebApplication> CreateAsync(FakeProbe probe)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddSingleton<IHealthDependencyProbe>(probe);
        var app = builder.Build();
        app.MapHealthEndpoints();
        await app.StartAsync();
        return app;
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return body.RootElement.Clone();
    }

    private sealed class FakeProbe : IHealthDependencyProbe
    {
        public Func<CancellationToken, Task<bool>> Database { get; init; } = _ => Task.FromResult(true);
        public Func<CancellationToken, Task<bool>> Redis { get; init; } = _ => Task.FromResult(true);
        public Func<CancellationToken, Task<bool>> Storage { get; init; } = _ => Task.FromResult(true);
        public int StorageCalls { get; private set; }
        public Task<bool> DatabaseAsync(CancellationToken cancellationToken) => Database(cancellationToken);
        public Task<bool> RedisAsync(CancellationToken cancellationToken) => Redis(cancellationToken);
        public Task<bool> StorageAsync(CancellationToken cancellationToken)
        {
            StorageCalls++;
            return Storage(cancellationToken);
        }
    }

    private sealed class FakeCache : IDistributedCache
    {
        public string? LastKey { get; private set; }
        public bool ThrowOnGet { get; set; }
        public byte[]? Get(string key) => null;
        public Task<byte[]?> GetAsync(string key, CancellationToken token = default)
        {
            LastKey = key;
            return ThrowOnGet
                ? Task.FromException<byte[]?>(new InvalidOperationException("Redis unavailable"))
                : Task.FromResult<byte[]?>(null);
        }
        public void Refresh(string key) { }
        public Task RefreshAsync(string key, CancellationToken token = default) => Task.CompletedTask;
        public void Remove(string key) { }
        public Task RemoveAsync(string key, CancellationToken token = default) => Task.CompletedTask;
        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) { }
        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options,
            CancellationToken token = default) => Task.CompletedTask;
    }

    private sealed class FakeStorage : IFileStorageService
    {
        public Task<bool> IsReadyAsync(CancellationToken ct = default) => Task.FromResult(true);
        public Task<string> UploadAsync(Stream stream, string objectKey, string contentType, CancellationToken ct = default) =>
            throw new NotSupportedException();
        public Task<Stream> OpenReadAsync(string fileUrl, CancellationToken ct = default) =>
            throw new NotSupportedException();
        public Task DeleteAsync(string fileUrl, CancellationToken ct = default) =>
            throw new NotSupportedException();
    }
}
