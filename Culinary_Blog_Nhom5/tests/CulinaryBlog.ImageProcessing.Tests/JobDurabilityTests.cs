using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Services;
using CulinaryBlog.Infrastructure.Services.Images;
using CulinaryBlog.Infrastructure.Services.Jobs;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Minio;
using Xunit;
using Xunit.Abstractions;

namespace CulinaryBlog.ImageProcessing.Tests;

public sealed class JobDurabilityTests(ITestOutputHelper output)
{
    private static Action<IServiceCollection> Faults(FaultPlan plan, SafeJobLogs logs) => services =>
    {
        services.AddSingleton<ILoggerProvider>(logs);
        services.AddScoped<MinioFileStorageService>(sp => new MinioFileStorageService(
            sp.GetRequiredService<IMinioClient>(), sp.GetRequiredService<IOptions<MinioOptions>>()));
        services.AddScoped<IFileStorageService>(sp => new FaultStorage(sp.GetRequiredService<MinioFileStorageService>(), plan));
        services.AddSingleton<IRecipeImageDeletionQueue, OfflineDeletionQueue>();
    };
    private void Evidence(string scenario, Guid key, object state, SafeJobLogs logs) => output.WriteLine("DURABILITY_EVIDENCE {0}",
        JsonSerializer.Serialize(new { scenario, businessKey = key, state, events = logs.Events.ToArray() }));
    private static async Task MarkDeleted(ImageTestApp app, Guid imageId)
    {
        using var result = await app.Client().DeleteAsync($"/api/v1/recipes/{app.RecipeId}/images/{imageId}");
        Assert.Equal(HttpStatusCode.NoContent, result.StatusCode);
    }
    private static Task<RecipeImageDeletionWork> Deletion(ImageTestApp app, Guid id) => app.Db(db =>
        db.RecipeImageDeletionWork.AsNoTracking().SingleAsync(x => x.ImageId == id));
    private static async Task Exists(ImageTestApp app, string url)
    {
        await app.Run<MinioFileStorageService>(async storage => { await using var data = await storage.OpenReadAsync(url); Assert.True(data.Length > 0); });
    }
    private static async Task Missing(ImageTestApp app, string url)
    {
        await app.Run<MinioFileStorageService>(async storage => { await Assert.ThrowsAnyAsync<Exception>(() => storage.OpenReadAsync(url)); });
    }

    [Fact]
    public async Task Deletion_attempt_cap_and_exponential_backoff_survive_restart_and_duplicate_dispatch()
    {
        var plan = new FaultPlan { FailDelete = true }; var logs = new SafeJobLogs();
        await using var app = await ImageTestApp.CreateAsync(configure: Faults(plan, logs));
        var image = await app.UploadAsync(); await MarkDeleted(app, image.Id);
        for (var attempt = 1; attempt <= BackgroundJobRetryPolicy.MaximumAttempts; attempt++)
        {
            var error = await Assert.ThrowsAsync<ImageDeletionException>(() => app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, default)));
            Assert.Null(error.InnerException); Assert.DoesNotContain("private", error.ToString());
            var work = await Deletion(app, image.Id);
            Assert.Equal(attempt, work.AttemptCount);
            Assert.Equal(attempt == 4 ? "Failed" : "Pending", work.Status);
            Assert.Equal(TimeSpan.FromSeconds(BackgroundJobRetryPolicy.DelayAfter(attempt)), work.NextAttemptAt - work.UpdatedAt);
            await app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, default));
            Assert.Equal(attempt, plan.DeleteCalls);
            app.Clock.Advance(BackgroundJobRetryPolicy.DelayAfter(attempt) + 1);
            await app.RestartAsync();
        }
        await app.Run<RecipeImageDeletionRecoveryJob>(job => job.EnqueuePendingAsync(default));
        await app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, default));
        Assert.Equal(4, plan.DeleteCalls); await Exists(app, image.OriginalUrl);
        Evidence("deletion-poison-cap-restart", image.Id, new { status = (await Deletion(app, image.Id)).Status, attempts = plan.DeleteCalls }, logs);
    }

    [Fact]
    public async Task Partial_object_deletion_and_db_failure_preserve_manifest_until_retry_succeeds()
    {
        var plan = new FaultPlan(); var logs = new SafeJobLogs();
        await using var app = await ImageTestApp.CreateAsync(configure: Faults(plan, logs));
        var image = await app.UploadAsync();
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(image.Id, default));
        var complete = await app.Image(image.Id);
        await MarkDeleted(app, image.Id);
        plan.FailDeleteAt = 2;
        await Assert.ThrowsAsync<ImageDeletionException>(() => app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, default)));
        await Missing(app, image.OriginalUrl); await Exists(app, complete.MediumUrl!); await Exists(app, complete.ThumbnailUrl!);
        Assert.True((await app.Image(image.Id)).IsDeleted);
        plan.FailDeleteAt = 0; app.Clock.Advance(61); await app.RestartAsync();
        await app.Db(db => db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION durability_fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
                RAISE EXCEPTION 'private database deletion failure'; END; $$;
            CREATE TRIGGER durability_fail_delete BEFORE DELETE ON "RecipeImages" FOR EACH ROW EXECUTE FUNCTION durability_fail_delete();
            """));
        await Assert.ThrowsAsync<ImageDeletionException>(() => app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, default)));
        Assert.Equal("Pending", (await Deletion(app, image.Id)).Status);
        Assert.True((await app.Image(image.Id)).IsDeleted);
        await app.Db(db => db.Database.ExecuteSqlRawAsync("DROP TRIGGER durability_fail_delete ON \"RecipeImages\"; DROP FUNCTION durability_fail_delete();"));
        app.Clock.Advance(121); await app.RestartAsync();
        await app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, default));
        await app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, default));
        Assert.Equal("Completed", (await Deletion(app, image.Id)).Status);
        Assert.Equal(3, (await Deletion(app, image.Id)).AttemptCount);
        Assert.False(await app.Db(db => db.RecipeImages.IgnoreQueryFilters().AnyAsync(x => x.Id == image.Id)));
        await Missing(app, image.OriginalUrl); await Missing(app, complete.MediumUrl!); await Missing(app, complete.ThumbnailUrl!);
        Assert.DoesNotContain("private", JsonSerializer.Serialize(logs.Events));
        Evidence("deletion-partial-io-db-restart", image.Id, new { status = "Completed", attempts = 3 }, logs);
    }

    [Fact]
    public async Task Cancelled_deletion_keeps_intent_and_worker_restart_recovers_queue_outage_once()
    {
        var plan = new FaultPlan { BlockDelete = true }; var logs = new SafeJobLogs();
        await using var app = await ImageTestApp.CreateAsync(configure: Faults(plan, logs));
        var image = await app.UploadAsync(); await MarkDeleted(app, image.Id);
        using var cancel = new CancellationTokenSource();
        var pending = app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, cancel.Token));
        await plan.DeleteEntered.Task.WaitAsync(TimeSpan.FromSeconds(15)); cancel.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending);
        Assert.Equal("Pending", (await Deletion(app, image.Id)).Status); await Exists(app, image.OriginalUrl);
        plan.BlockDelete = false; app.Clock.Advance(61);
        await app.RestartAsync();
        await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => app.Run<RecipeImageDeletionRecoveryJob>(job => job.EnqueuePendingAsync(default))));
        var work = await Deletion(app, image.Id); Assert.NotNull(work.HangfireJobId);
        await app.Run<RecipeImageDeletionRecoveryJob>(job => job.EnqueuePendingAsync(default));
        Assert.Equal(work.HangfireJobId, (await Deletion(app, image.Id)).HangfireJobId);
        await app.RestartAsync(worker: true);
        // The original processing job can briefly own the image lock after restart.
        // A real Hangfire retry uses wall-clock 60s, independent of the business test clock.
        try { await app.WaitAsync(async () => (await Deletion(app, image.Id)).Status == "Completed", TimeSpan.FromSeconds(150)); }
        catch
        {
            var pendingWork = await Deletion(app, image.Id);
            using var connection = app.Services.GetRequiredService<JobStorage>().GetConnection();
            var jobState = connection.GetStateData(work.HangfireJobId!);
            string? errorType = null;
            jobState?.Data.TryGetValue("ExceptionType", out errorType);
            Evidence("deletion-restart-timeout", image.Id, new { pendingWork.Status, pendingWork.AttemptCount,
                pendingWork.LastErrorCode, hangfireState = jobState?.Name,
                errorType }, logs);
            throw;
        }
        Assert.Equal(2, (await Deletion(app, image.Id)).AttemptCount);
        await Missing(app, image.OriginalUrl);
        Evidence("deletion-cancel-queue-outage-restart", image.Id, new { status = "Completed", jobId = work.HangfireJobId, attempts = 2 }, logs);
    }

    [Fact]
    public async Task Recipe_retention_blocks_individual_deletion_and_purge_removes_unpublished_generations()
    {
        var plan = new FaultPlan(); var logs = new SafeJobLogs();
        await using var app = await ImageTestApp.CreateAsync(configure: Faults(plan, logs));
        var image = await app.UploadAsync(); await MarkDeleted(app, image.Id);
        var deletedAt = DateTime.UtcNow.AddDays(-29);
        await app.Db(db => db.Recipes.Where(x => x.Id == app.RecipeId).ExecuteUpdateAsync(set => set.SetProperty(x => x.IsDeleted, true).SetProperty(x => x.UpdatedAt, deletedAt)));
        await app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, default));
        await app.Run<PurgeDeletedRecipesJob>(job => job.RunAsync(default));
        await Exists(app, image.OriginalUrl);
        Assert.Equal(0, (await Deletion(app, image.Id)).AttemptCount);
        Assert.Equal("RecipeRetention", (await Deletion(app, image.Id)).LastErrorCode);
        var generation = new RecipeImageGeneration { ImageId = image.Id, RecipeId = app.RecipeId };
        await app.Db(async db => { db.RecipeImageGenerations.Add(generation); return await db.SaveChangesAsync(); });
        await app.Run<MinioFileStorageService>(async storage => {
            await using var bytes = new MemoryStream([1, 2, 3]); await storage.UploadAsync(bytes, generation.MediumKey, "image/jpeg");
            await storage.UploadAsync(bytes, generation.ThumbnailKey, "image/jpeg");
        });
        await app.Db(db => db.Recipes.IgnoreQueryFilters().Where(x => x.Id == app.RecipeId).ExecuteUpdateAsync(set => set.SetProperty(x => x.UpdatedAt, DateTime.UtcNow.AddDays(-31))));
        await app.Run<PurgeDeletedRecipesJob>(job => job.RunAsync(default));
        await app.Run<PurgeDeletedRecipesJob>(job => job.RunAsync(default));
        await Missing(app, image.OriginalUrl);
        await app.Run<ImageVariantStorage>(async variants => { await Missing(app, variants.Url(generation.MediumKey)); await Missing(app, variants.Url(generation.ThumbnailKey)); });
        Assert.False(await app.Db(db => db.Recipes.IgnoreQueryFilters().AnyAsync(x => x.Id == app.RecipeId)));
        Evidence("retention-purge-generations", image.Id, new { retainedDays = 29, purgeAfterDays = 31, status = "Completed" }, logs);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Ambiguous_original_put_or_metadata_failure_and_failed_compensation_reconcile_after_api_restart(bool metadataFailure)
    {
        var plan = new FaultPlan { FailOriginalAfterPut = !metadataFailure, FailDelete = true }; var logs = new SafeJobLogs();
        await using var app = await ImageTestApp.CreateAsync(configure: Faults(plan, logs));
        if (metadataFailure) await app.Db(db => db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION durability_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
                RAISE EXCEPTION 'private metadata insert failure'; END; $$;
            CREATE TRIGGER durability_fail_insert BEFORE INSERT ON "RecipeImages" FOR EACH ROW EXECUTE FUNCTION durability_fail_insert();
            """));
        using var form = new MultipartFormDataContent(); using var content = new ByteArrayContent(ImageTestApp.Sample(ImageMagick.MagickFormat.Png));
        content.Headers.ContentType = new MediaTypeHeaderValue("image/png"); form.Add(content, "file", "sample.png");
        using var response = await app.Client().PostAsync($"/api/v1/recipes/{app.RecipeId}/images", form);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var intent = await app.Db(db => db.RecipeImageUploadIntents.AsNoTracking().SingleAsync());
        var settings = app.Services.GetRequiredService<IOptions<MinioOptions>>().Value;
        var url = settings.PublicBaseUrl + "/" + settings.Bucket + "/" + intent.ObjectKey;
        await Exists(app, url); Assert.False(await app.Db(db => db.RecipeImages.AnyAsync()));
        app.Clock.Advance(601); await app.RestartAsync();
        await app.Run<RecipeImageUploadCleanup>(job => job.SweepAsync(default));
        Assert.Null((await app.Db(db => db.RecipeImageUploadIntents.AsNoTracking().SingleAsync())).CleanedAt);
        plan.FailDelete = false; app.Clock.Advance(61); await app.RestartAsync();
        await app.Run<RecipeImageUploadCleanup>(job => job.SweepAsync(default));
        await Missing(app, url);
        Assert.NotNull((await app.Db(db => db.RecipeImageUploadIntents.AsNoTracking().SingleAsync())).CleanedAt);
        Evidence(metadataFailure ? "metadata-insert-compensation-restart" : "original-put-unknown-outcome-restart", intent.ImageId, new { orphanRemoved = true, status = "Cleaned" }, logs);
    }

    [Fact]
    public async Task Every_owned_side_effect_job_has_three_exponential_retries()
    {
        foreach (var (type, method) in new[] {
            (typeof(RecipeImageProcessingJob), "ProcessAsync"), (typeof(RecipeImageDeletionJob), "DeleteAsync"),
            (typeof(PurgeDeletedRecipesJob), "RunAsync"), (typeof(CulinaryBlog.Infrastructure.Services.Email.WelcomeEmailJob), "SendAsync") })
        {
            // Read metadata without constructing the attribute: Hangfire's global logger may
            // still point at a disposed host after a restart fixture has completed.
            var attribute = Assert.Single(type.GetMethod(method)!.CustomAttributes, x => x.AttributeType == typeof(AutomaticRetryAttribute));
            Assert.Equal(3, attribute.NamedArguments.Single(x => x.MemberName == "Attempts").TypedValue.Value);
            var delays = (IEnumerable<System.Reflection.CustomAttributeTypedArgument>)attribute.NamedArguments.Single(x => x.MemberName == "DelaysInSeconds").TypedValue.Value!;
            Assert.Equal(new[] { 60, 120, 240 }, delays.Select(x => (int)x.Value!));
        }
        await Task.CompletedTask;
    }

    [Fact]
    public async Task Original_cleanup_poison_budget_survives_restart_and_does_not_retry_forever()
    {
        var plan = new FaultPlan { FailDelete = true }; var logs = new SafeJobLogs();
        await using var app = await ImageTestApp.CreateAsync(configure: Faults(plan, logs));
        var id = Guid.NewGuid();
        await app.Run<IRecipeImageUploadIntents>(intents => intents.BeginAsync(id, app.RecipeId, $"recipes/{app.RecipeId}/{id:N}.png", default));
        app.Clock.Advance(601);
        foreach (var delay in new[] { 60, 120, 240, 240 })
        {
            await app.Run<RecipeImageUploadCleanup>(cleanup => cleanup.SweepAsync(default));
            app.Clock.Advance(delay + 1); await app.RestartAsync();
        }
        var failed = await app.Db(db => db.RecipeImageUploadIntents.AsNoTracking().SingleAsync(x => x.ImageId == id));
        Assert.True(failed.Failed); Assert.Equal(4, failed.CleanupAttemptCount); Assert.Null(failed.CleanedAt);
        var calls = plan.DeleteCalls;
        await app.Run<RecipeImageUploadCleanup>(cleanup => cleanup.SweepAsync(default));
        Assert.Equal(calls, plan.DeleteCalls);
        Evidence("original-cleanup-poison-restart-budget", id, new { status = "Failed", attempts = 4, operatorRecoveryRequired = true }, logs);
    }

    private sealed class OfflineDeletionQueue : IRecipeImageDeletionQueue
    {
        public Task EnqueueAsync(Guid imageId, CancellationToken cancellationToken = default) => throw new IOException("private queue outage");
    }
    private sealed class FaultPlan
    {
        public bool FailDelete, FailOriginalAfterPut, BlockDelete;
        public int FailDeleteAt, DeleteCalls;
        public TaskCompletionSource DeleteEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }
    private sealed class FaultStorage(IFileStorageService inner, FaultPlan plan) : IFileStorageService
    {
        public Task<bool> IsReadyAsync(CancellationToken ct = default) => inner.IsReadyAsync(ct);
        public Task<Stream> OpenReadAsync(string url, CancellationToken ct = default) => inner.OpenReadAsync(url, ct);
        public async Task<string> UploadAsync(Stream stream, string key, string type, CancellationToken ct = default)
        {
            var result = await inner.UploadAsync(stream, key, type, ct);
            if (plan.FailOriginalAfterPut && !key.EndsWith(".jpg")) throw new IOException("private PUT acknowledgement lost");
            return result;
        }
        public async Task DeleteAsync(string url, CancellationToken ct = default)
        {
            var call = Interlocked.Increment(ref plan.DeleteCalls); plan.DeleteEntered.TrySetResult();
            if (plan.BlockDelete) await Task.Delay(Timeout.Infinite, ct);
            if (plan.FailDelete || plan.FailDeleteAt == call) throw new IOException("private MinIO delete outage");
            await inner.DeleteAsync(url, ct);
        }
    }
    private sealed class SafeJobLogs : ILoggerProvider
    {
        public System.Collections.Concurrent.ConcurrentQueue<object> Events { get; } = new();
        public ILogger CreateLogger(string categoryName) => new Sink(categoryName, Events);
        public void Dispose() { }
        private sealed class Sink(string category, System.Collections.Concurrent.ConcurrentQueue<object> events) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => category.StartsWith("CulinaryBlog.", StringComparison.Ordinal);
            public void Log<TState>(LogLevel level, EventId id, TState state, Exception? error, Func<TState, Exception?, string> formatter)
            {
                if (!IsEnabled(level) || state is not IEnumerable<KeyValuePair<string, object?>> fields) return;
                var safe = fields.Where(x => new[] { "CorrelationId", "RecipeImageId", "EmailMessageId", "RecipeId", "Attempt", "ErrorCategory", "JobId" }.Contains(x.Key))
                    .ToDictionary(x => x.Key, x => x.Value?.ToString());
                if (safe.Count > 0) events.Enqueue(new { category, level = level.ToString(), fields = safe });
            }
        }
    }
}
