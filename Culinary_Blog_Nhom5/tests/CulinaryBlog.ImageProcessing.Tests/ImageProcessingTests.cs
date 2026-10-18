using System.Net;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Infrastructure.Services;
using CulinaryBlog.Infrastructure.Services.Images;
using Hangfire;
using ImageMagick;
using ImageMagick.Drawing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using CulinaryBlog.Domain.Entities;
using Microsoft.Extensions.DependencyInjection;
using Minio;
using Minio.DataModel.Args;
using Xunit;

namespace CulinaryBlog.ImageProcessing.Tests;

public sealed class ImageProcessingTests
{
    [Fact]
    public async Task Recovery_dispatch_with_real_fast_worker_and_parallel_dispatchers_completes()
    {
        await using var app = await ImageTestApp.CreateAsync(worker: true, configure: services => services.AddSingleton<IRecipeImageProcessingQueue, BrokenQueue>());
        var item = await app.UploadAsync();
        await Task.WhenAll(app.Run<RecipeImageProcessingRecoveryJob>(job => job.EnqueuePendingAsync(default)),
            app.Run<RecipeImageProcessingRecoveryJob>(job => job.EnqueuePendingAsync(default)));
        await app.WaitAsync(async () => (await app.Image(item.Id)).ProcessingStatus == "Completed");
        Assert.Equal(1, (await app.Work(item.Id)).AttemptCount);
    }

    [Fact]
    public async Task Transient_claim_insert_retry_does_not_reuse_rolled_back_tracked_entities()
    {
        await using var app = await ImageTestApp.CreateAsync(); var item = await app.UploadAsync();
        await app.Db(db => db.Database.ExecuteSqlRawAsync("""
            CREATE SEQUENCE fail_generation_once;
            CREATE FUNCTION retry_generation_once() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
              IF nextval('fail_generation_once') = 1 THEN RAISE EXCEPTION 'test-only transient error' USING ERRCODE = '40001'; END IF;
              RETURN NEW;
            END; $$;
            CREATE TRIGGER retry_generation_once BEFORE INSERT ON "RecipeImageGenerations" FOR EACH ROW EXECUTE FUNCTION retry_generation_once();
            """));
        await app.Run<ImageProcessingStore>(async store => Assert.NotNull(await store.ClaimAsync(item.Id, default)));
        Assert.Equal(1, (await app.Work(item.Id)).AttemptCount);
        Assert.Equal(1, await app.Db(db => db.RecipeImageGenerations.CountAsync()));
    }

    [Fact]
    public async Task Migration_backfills_legacy_states_and_down_up_keeps_existing_images()
    {
        await using var app = await ImageTestApp.CreateAsync();
        await app.Db(async db =>
        {
            var migrations = db.Database.GetMigrations().ToArray();
            var durableImageMigration = Array.FindIndex(
                migrations,
                migration => migration.EndsWith("AddDurableImageProcessing", StringComparison.Ordinal));
            Assert.True(durableImageMigration > 0, "The durable image processing migration must have a prior baseline.");
            var previous = migrations[durableImageMigration - 1];
            await db.GetService<IMigrator>().MigrateAsync(previous);
            var states = new[] { "Processing", "Completed", "Failed", "Pending" };
            for (var index = 0; index < states.Length; index++)
                db.RecipeImages.Add(new RecipeImage { RecipeId = app.RecipeId, OrderIndex = index, OriginalUrl = "http://legacy.test/original.jpg",
                    ProcessingStatus = states[index], MediumUrl = index == 1 ? "http://legacy.test/medium.jpg" : null,
                    ThumbnailUrl = index == 1 ? "http://legacy.test/thumbnail.jpg" : null, IsDeleted = index == 3 });
            await db.SaveChangesAsync(); await db.Database.MigrateAsync(); return 0;
        });
        var rows = await app.Db(db => db.RecipeImageWork.AsNoTracking().ToListAsync());
        Assert.Equal(4, rows.Count); Assert.Contains(rows, x => x.Status == "Pending"); Assert.Contains(rows, x => x.Status == "Completed");
        Assert.Contains(rows, x => x.Status == "Failed"); Assert.Contains(rows, x => x.Status == "Skipped");
        Assert.All(rows, x => Assert.Equal("LegacyBackfill", x.LastErrorCode));
        Assert.Equal(4, await app.Db(db => db.RecipeImages.IgnoreQueryFilters().CountAsync()));
    }

    [Theory]
    [InlineData(MagickFormat.Jpeg, "image/jpeg", "sample.jpg", 1200, 400)]
    [InlineData(MagickFormat.Png, "image/png", "sample.png", 400, 1200)]
    [InlineData(MagickFormat.WebP, "image/webp", "sample.webp", 32, 32)]
    [InlineData(MagickFormat.Avif, "image/avif", "sample.avif", 600, 600)]
    public async Task Real_worker_and_minio_produce_exact_jpeg_variants_and_preserve_original(MagickFormat format, string mime, string filename, int width, int height)
    {
        await using var app = await ImageTestApp.CreateAsync(worker: true);
        var original = ImageTestApp.Sample(format, (uint)width, (uint)height);
        var image = await app.UploadAsync(original, mime, filename);
        await app.WaitAsync(async () =>
        {
            var status = (await app.Image(image.Id)).ProcessingStatus;
            Assert.NotEqual("Failed", status);
            return status == "Completed";
        });
        var final = await app.Image(image.Id);
        await app.Run<IFileStorageService>(async storage =>
        {
            await using var raw = await storage.OpenReadAsync(final.OriginalUrl);
            using var buffer = new MemoryStream(); await raw.CopyToAsync(buffer); Assert.Equal(original, buffer.ToArray());
            await using var medium = await storage.OpenReadAsync(final.MediumUrl!); using var decoded = new MagickImage(medium);
            Assert.Equal((uint)800, decoded.Width); Assert.Equal((uint)600, decoded.Height); Assert.Equal(MagickFormat.Jpeg, decoded.Format);
            await using var thumb = await storage.OpenReadAsync(final.ThumbnailUrl!); using var small = new MagickImage(thumb);
            Assert.Equal((uint)300, small.Width); Assert.Equal((uint)300, small.Height);
        });
        var minio = app.Services.GetRequiredService<IMinioClient>();
        var manifest = await app.Db(db => db.RecipeImageGenerations.SingleAsync(x => x.ImageId == image.Id));
        var bucket = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<MinioOptions>>().Value.Bucket;
        var stat = await minio.StatObjectAsync(new StatObjectArgs().WithBucket(bucket).WithObject(manifest.MediumKey));
        Assert.Equal("image/jpeg", stat.ContentType);
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(image.Id, default));
        Assert.Equal(1, (await app.Work(image.Id)).AttemptCount);
        Assert.Equal(1, await app.Db(db => db.RecipeImageGenerations.CountAsync()));
    }

    [Fact]
    public async Task Ambiguous_partial_put_and_failed_cleanup_are_recovered_from_durable_manifest()
    {
        var fault = new StorageFault();
        await using var app = await ImageTestApp.CreateAsync(configure: services =>
        {
            services.AddScoped<MinioFileStorageService>();
            services.AddScoped<IFileStorageService>(sp => new FaultingStorage(sp.GetRequiredService<MinioFileStorageService>(), fault));
        });
        var item = await app.UploadAsync();
        await Assert.ThrowsAsync<ImageProcessingException>(() => app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(item.Id, default)));
        var generation = await app.Db(db => db.RecipeImageGenerations.SingleAsync());
        Assert.Null(generation.CleanedAt); Assert.Null((await app.Image(item.Id)).MediumUrl); Assert.Equal("Pending", (await app.Work(item.Id)).Status);
        fault.BrokenCleanup = false; app.Clock.Advance(301);
        await app.Run<ImageGenerationCleanup>(async cleanup =>
        {
            using var scope = app.Services.CreateScope(); await cleanup.SweepAsync(scope.ServiceProvider.GetRequiredService<ImageWorkLock>(), default);
        });
        Assert.NotNull(await app.Db(db => db.RecipeImageGenerations.Select(x => x.CleanedAt).SingleAsync()));
        await app.Run<ImageVariantStorage>(async variants => await app.Run<IFileStorageService>(async storage =>
            await Assert.ThrowsAnyAsync<Exception>(() => storage.OpenReadAsync(variants.Url(generation.MediumKey)))));
    }

    [Fact]
    public async Task Process_deadline_kills_worker_before_releasing_its_slot()
    {
        var info = new System.Diagnostics.ProcessStartInfo(OperatingSystem.IsWindows() ? "powershell" : "/bin/sh") { UseShellExecute = false, CreateNoWindow = true };
        foreach (var argument in OperatingSystem.IsWindows() ? new[] { "-NoProfile", "-Command", "Start-Sleep -Seconds 30" } : new[] { "-c", "sleep 30" }) info.ArgumentList.Add(argument);
        using var process = System.Diagnostics.Process.Start(info)!;
        using var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => ImageProcessSupervisor.WaitAsync(process, deadline.Token));
        Assert.True(process.HasExited);
    }

    [Fact]
    public async Task Missing_completed_variant_is_reconciled_and_recreated_in_new_generation()
    {
        await using var app = await ImageTestApp.CreateAsync(); var item = await app.UploadAsync();
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(item.Id, default));
        var first = await app.Image(item.Id);
        await app.Run<IFileStorageService>(storage => storage.DeleteAsync(first.ThumbnailUrl!));
        app.Clock.Advance(3601);
        await app.Run<ImageVariantReconciler>(reconciler => reconciler.ReconcileAsync(default));
        Assert.Equal("Pending", (await app.Work(item.Id)).Status); Assert.Null((await app.Image(item.Id)).ThumbnailUrl);
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(item.Id, default));
        Assert.Equal("Completed", (await app.Image(item.Id)).ProcessingStatus); Assert.NotEqual(first.MediumUrl, (await app.Image(item.Id)).MediumUrl);
    }

    [Fact]
    public async Task Hangfire_real_worker_schedules_retry_and_keeps_business_pending()
    {
        await using var app = await ImageTestApp.CreateAsync(worker: true, configure: services => services.AddSingleton<IImageVariantRenderer, FailingRenderer>());
        var item = await app.UploadAsync();
        await app.WaitAsync(async () => (await app.Work(item.Id)).LastErrorCode != null);
        await app.WaitAsync(async () =>
        {
            var work = await app.Work(item.Id); if (work.HangfireJobId is null) return false;
            using var connection = app.Services.GetRequiredService<JobStorage>().GetConnection(); return connection.GetJobData(work.HangfireJobId)?.State == "Scheduled";
        });
        Assert.Equal("Pending", (await app.Work(item.Id)).Status); Assert.Equal(1, (await app.Work(item.Id)).AttemptCount);
    }

    [Fact]
    public async Task Cancellation_does_not_mark_completed_and_preserves_backoff()
    {
        var renderer = new BlockingRenderer();
        await using var app = await ImageTestApp.CreateAsync(configure: services => services.AddSingleton<IImageVariantRenderer>(renderer));
        var image = await app.UploadAsync(); using var cancel = new CancellationTokenSource();
        var running = app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(image.Id, cancel.Token));
        await renderer.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10)); cancel.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => running);
        Assert.Equal("Pending", (await app.Work(image.Id)).Status); Assert.Null((await app.Image(image.Id)).MediumUrl);
    }

    [Fact]
    public async Task Image_insert_failure_rolls_back_its_trigger_intent_and_compensates_original()
    {
        await using var app = await ImageTestApp.CreateAsync();
        await app.Db(db => db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION fail_work_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only work failure'; END; $$;
            CREATE TRIGGER fail_work_insert BEFORE INSERT ON "RecipeImageWork" FOR EACH ROW EXECUTE FUNCTION fail_work_insert();
            """));
        using var form = new MultipartFormDataContent(); using var bytes = new ByteArrayContent(ImageTestApp.Sample(MagickFormat.Png));
        bytes.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png"); form.Add(bytes, "file", "image.png");
        using var response = await app.Client().PostAsync($"/api/v1/recipes/{app.RecipeId}/images", form);
        Assert.NotEqual(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(0, await app.Db(db => db.RecipeImages.CountAsync())); Assert.Equal(0, await app.Db(db => db.RecipeImageWork.CountAsync()));
    }

    [Fact]
    public async Task Renderer_flattens_alpha_strips_metadata_and_applies_orientation()
    {
        using var image = new MagickImage(MagickColors.Transparent, 120, 60);
        image.Format = MagickFormat.Png; image.Comment = "private metadata";
        using var source = new MemoryStream(image.ToByteArray());
        var output = await new IsolatedImageRenderer().RenderAsync(source, default);
        using var decoded = new MagickImage(output.Thumbnail);
        Assert.False(decoded.HasAlpha); Assert.True(string.IsNullOrEmpty(decoded.Comment));
        var pixel = decoded.GetPixels().GetPixel(100, 100).ToColor()!;
        Assert.True(pixel.R > 245 && pixel.G > 245 && pixel.B > 245);
        using var oriented = new MagickImage(MagickColors.Red, 120, 60);
        new Drawables().FillColor(MagickColors.Blue).Rectangle(60, 0, 119, 59).Draw(oriented);
        oriented.Orientation = OrientationType.RightTop;
        oriented.SetProfile(ColorProfiles.AdobeRGB1998);
        var exif = new ExifProfile(); exif.SetValue(ExifTag.Orientation, (ushort)6); exif.SetValue(ExifTag.GPSLatitudeRef, "N"); oriented.SetProfile(exif);
        using var input = new MemoryStream(oriented.ToByteArray(MagickFormat.Jpeg));
        var rotated = await new IsolatedImageRenderer().RenderAsync(input, default);
        using var result = new MagickImage(rotated.Medium);
        Assert.Null(result.GetExifProfile()); Assert.Equal((uint)800, result.Width); Assert.Equal((uint)600, result.Height);
        Assert.Null(result.GetColorProfile());
        var top = result.GetPixels().GetPixel(400, 50).ToColor()!;
        var bottom = result.GetPixels().GetPixel(400, 550).ToColor()!;
        Assert.True(top.R > top.B); Assert.True(bottom.B > bottom.R);
    }

    [Fact]
    public async Task Animated_webp_uses_first_frame_without_decoding_unbounded_sequence()
    {
        using var frames = new MagickImageCollection { new MagickImage(MagickColors.Red, 20, 20), new MagickImage(MagickColors.Blue, 20, 20) };
        using var input = new MemoryStream(); frames.Write(input, MagickFormat.WebP); input.Position = 0;
        var output = await new IsolatedImageRenderer().RenderAsync(input, default);
        using var image = new MagickImage(output.Thumbnail);
        var pixel = image.GetPixels().GetPixel(150, 150).ToColor()!; Assert.True(pixel.R > pixel.B);
    }

    [Theory]
    [InlineData("invalid")]
    [InlineData("large-pixels")]
    public async Task Invalid_content_is_terminal_without_fake_urls_or_retries(string kind)
    {
        await using var app = await ImageTestApp.CreateAsync();
        var bytes = kind == "invalid" ? new byte[] { 0xff, 0xd8, 0xff, 1, 2, 3 } : ImageTestApp.Sample(MagickFormat.Png, 7000, 7000);
        var item = await app.UploadAsync(bytes, kind == "invalid" ? "image/jpeg" : "image/png", kind == "invalid" ? "bad.jpg" : "large.png");
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(item.Id, default));
        var image = await app.Image(item.Id); Assert.Equal("Failed", image.ProcessingStatus); Assert.Null(image.MediumUrl); Assert.Null(image.ThumbnailUrl);
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(item.Id, default)); Assert.Equal(1, (await app.Work(item.Id)).AttemptCount);
    }

    [Fact]
    public async Task Bounded_original_read_rejects_oversized_storage_object()
    {
        await using var app = await ImageTestApp.CreateAsync();
        var image = await app.UploadAsync();
        await app.Run<IFileStorageService>(async storage =>
        {
            using var oversized = new MemoryStream(new byte[IsolatedImageRenderer.MaximumBytes + 1]);
            await storage.UploadAsync(oversized, $"recipes/{app.RecipeId}/{image.Id:N}.png", "image/png");
            await Assert.ThrowsAnyAsync<Exception>(() => storage.OpenReadAsync(image.OriginalUrl));
        });
    }

    [Fact]
    public async Task Queue_outage_keeps_uploaded_image_and_recovery_enqueues_only_one_live_job()
    {
        await using var app = await ImageTestApp.CreateAsync(configure: services => services.AddSingleton<IRecipeImageProcessingQueue, BrokenQueue>());
        var item = await app.UploadAsync();
        Assert.Equal("Pending", (await app.Image(item.Id)).ProcessingStatus);
        Assert.Equal(0, (await app.Work(item.Id)).AttemptCount);
        await app.Run<RecipeImageProcessingRecoveryJob>(job => job.EnqueuePendingAsync(default));
        var queued = await app.Work(item.Id); Assert.NotNull(queued.HangfireJobId);
        await app.Run<RecipeImageProcessingRecoveryJob>(job => job.EnqueuePendingAsync(default));
        Assert.Equal(queued.HangfireJobId, (await app.Work(item.Id)).HangfireJobId);
        using var connection = app.Services.GetRequiredService<JobStorage>().GetConnection();
        var data = connection.GetJobData(queued.HangfireJobId)!; Assert.Equal(item.Id, data.Job.Args[0]); Assert.Equal(2, data.Job.Args.Count);
        app.Services.GetRequiredService<IBackgroundJobClient>().Delete(queued.HangfireJobId);
        await app.Run<RecipeImageProcessingRecoveryJob>(job => job.EnqueuePendingAsync(default));
        Assert.NotEqual(queued.HangfireJobId, (await app.Work(item.Id)).HangfireJobId);
    }

    [Fact]
    public async Task Concurrent_duplicate_job_cannot_claim_live_image_and_other_image_can_claim()
    {
        var renderer = new BlockingRenderer();
        await using var app = await ImageTestApp.CreateAsync(configure: services => services.AddSingleton<IImageVariantRenderer>(renderer));
        var first = await app.UploadAsync(); var second = await app.UploadAsync();
        var running = app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(first.Id, default));
        await renderer.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(first.Id, default));
        Assert.Equal(1, renderer.Calls);
        await app.Run<ImageProcessingStore>(async store => Assert.NotNull(await store.ClaimAsync(second.Id, default)));
        renderer.Gate.SetResult(); await running;
        Assert.Equal("Completed", (await app.Image(first.Id)).ProcessingStatus);
    }

    [Fact]
    public async Task Deletion_during_resize_prevents_publish_and_removes_every_object()
    {
        var renderer = new BlockingRenderer();
        await using var app = await ImageTestApp.CreateAsync(configure: services => services.AddSingleton<IImageVariantRenderer>(renderer));
        var image = await app.UploadAsync();
        var running = app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(image.Id, default));
        await renderer.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        using var response = await app.Client().DeleteAsync($"/api/v1/recipes/{app.RecipeId}/images/{image.Id}");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await Assert.ThrowsAsync<InvalidOperationException>(() => app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, default)));
        renderer.Gate.SetResult(); await running;
        Assert.Null((await app.Image(image.Id)).MediumUrl);
        await app.Run<RecipeImageDeletionJob>(job => job.DeleteAsync(image.Id, default));
        Assert.Equal(0, await app.Db(db => db.RecipeImages.IgnoreQueryFilters().CountAsync()));
        Assert.True(await app.Db(db => db.RecipeImageGenerations.AllAsync(x => x.CleanedAt != null)));
    }

    [Fact]
    public async Task Backoff_cap_and_sanitized_failures_survive_duplicate_jobs()
    {
        await using var app = await ImageTestApp.CreateAsync(configure: services => services.AddSingleton<IImageVariantRenderer, FailingRenderer>());
        var image = await app.UploadAsync();
        for (var attempt = 1; attempt <= 4; attempt++)
        {
            var error = await Assert.ThrowsAsync<ImageProcessingException>(() => app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(image.Id, default)));
            Assert.Null(error.InnerException); Assert.DoesNotContain("private", error.ToString());
            Assert.Equal(attempt, (await app.Work(image.Id)).AttemptCount);
            await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(image.Id, default));
            Assert.Equal(attempt, (await app.Work(image.Id)).AttemptCount);
            app.Clock.Advance(ImageProcessingStore.RetrySeconds[Math.Min(attempt - 1, 2)] + 1);
        }
        Assert.Equal("Failed", (await app.Work(image.Id)).Status);
        await app.Run<RecipeImageProcessingRecoveryJob>(job => job.EnqueuePendingAsync(default));
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(image.Id, default));
        Assert.Equal(4, (await app.Work(image.Id)).AttemptCount);
    }

    [Fact]
    public async Task Abandoned_processing_recovers_and_stale_worker_cannot_publish_or_delete_new_generation()
    {
        await using var app = await ImageTestApp.CreateAsync(); var image = await app.UploadAsync();
        ImageProcessingClaim? abandoned = null;
        await app.Run<ImageProcessingStore>(async store => abandoned = await store.ClaimAsync(image.Id, default));
        app.Clock.Advance(181);
        await app.Run<RecipeImageProcessingRecoveryJob>(job => job.EnqueuePendingAsync(default));
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(image.Id, default));
        var complete = await app.Image(image.Id);
        await app.Run<ImageProcessingStore>(async store => Assert.False(await store.CompleteAsync(abandoned!, "old-medium", "old-thumbnail", default)));
        await app.Run<ImageGenerationCleanup>(cleanup => cleanup.DeleteGenerationAsync(abandoned!.Generation.Id, default));
        await app.Run<IFileStorageService>(async storage => { await using var stream = await storage.OpenReadAsync(complete.ThumbnailUrl!); Assert.True(stream.Length > 0); });
        Assert.Equal(2, (await app.Work(image.Id)).AttemptCount);
    }

    [Fact]
    public async Task Finalization_db_failure_keeps_manifest_and_cleanup_can_recover_after_restart()
    {
        await using var app = await ImageTestApp.CreateAsync(); var item = await app.UploadAsync();
        await app.Db(db => db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION fail_image_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
              IF NEW."ProcessingStatus" = 'Completed' THEN RAISE EXCEPTION 'test-only finalize failure'; END IF; RETURN NEW;
            END; $$;
            CREATE TRIGGER fail_image_complete BEFORE UPDATE ON "RecipeImages" FOR EACH ROW EXECUTE FUNCTION fail_image_complete();
            """));
        await Assert.ThrowsAnyAsync<Exception>(() => app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(item.Id, default)));
        Assert.Equal("Processing", (await app.Work(item.Id)).Status); Assert.Null((await app.Image(item.Id)).MediumUrl);
        await app.Db(db => db.Database.ExecuteSqlRawAsync("DROP TRIGGER fail_image_complete ON \"RecipeImages\"; DROP FUNCTION fail_image_complete();"));
        app.Clock.Advance(301);
        await app.Run<RecipeImageProcessingRecoveryJob>(job => job.EnqueuePendingAsync(default));
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(item.Id, default));
        Assert.Equal("Completed", (await app.Image(item.Id)).ProcessingStatus);
        Assert.Equal(1, await app.Db(db => db.RecipeImageGenerations.CountAsync(x => x.CleanedAt != null)));
    }

    [Theory]
    [InlineData("other", "Author", HttpStatusCode.Forbidden)]
    [InlineData("admin", "Admin", HttpStatusCode.OK)]
    public async Task Status_endpoint_enforces_owner_admin(string user, string role, HttpStatusCode status)
    {
        await using var app = await ImageTestApp.CreateAsync(); var image = await app.UploadAsync();
        using var response = await app.Client(user, role).GetAsync($"/api/v1/recipes/{app.RecipeId}/images/{image.Id}");
        var responseBody = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == status, $"Expected {status}, got {response.StatusCode}: {responseBody}");
        using var wrongRecipe = await app.Client().GetAsync($"/api/v1/recipes/{Guid.NewGuid()}/images/{image.Id}");
        var wrongRecipeBody = await wrongRecipe.Content.ReadAsStringAsync();
        Assert.True(wrongRecipe.StatusCode == HttpStatusCode.NotFound, $"Expected NotFound, got {wrongRecipe.StatusCode}: {wrongRecipeBody}");
    }

    [Fact]
    public async Task Soft_deleted_recipe_is_not_processed_and_purge_preserves_retention_then_cleans_ledger()
    {
        await using var app = await ImageTestApp.CreateAsync(); var item = await app.UploadAsync();
        var old = DateTime.UtcNow.AddDays(-31);
        await app.Db(db => db.Recipes.Where(x => x.Id == app.RecipeId).ExecuteUpdateAsync(set => set.SetProperty(x => x.IsDeleted, true).SetProperty(x => x.UpdatedAt, old)));
        await app.Run<RecipeImageProcessingJob>(job => job.ProcessAsync(item.Id, default));
        Assert.Equal("Skipped", (await app.Work(item.Id)).Status);
        Assert.Equal(old, (await app.Db(db => db.Recipes.IgnoreQueryFilters().Select(x => x.UpdatedAt).SingleAsync()))!.Value, TimeSpan.FromMilliseconds(1));
        await app.Run<PurgeDeletedRecipesJob>(job => job.RunAsync(default));
        Assert.Equal(0, await app.Db(db => db.Recipes.IgnoreQueryFilters().CountAsync()));
    }

    private sealed class BrokenQueue : IRecipeImageProcessingQueue
    {
        public Task EnqueueAsync(Guid id, CancellationToken ct = default) => throw new InvalidOperationException("QueueUnavailable");
    }
    private sealed class StorageFault { public bool BrokenCleanup = true; }
    private sealed class FaultingStorage(IFileStorageService inner, StorageFault fault) : IFileStorageService
    {
        public Task<bool> IsReadyAsync(CancellationToken ct = default) => inner.IsReadyAsync(ct);
        public Task<Stream> OpenReadAsync(string url, CancellationToken ct = default) => inner.OpenReadAsync(url, ct);
        public Task DeleteAsync(string url, CancellationToken ct = default) => fault.BrokenCleanup ? throw new IOException("test cleanup outage") : inner.DeleteAsync(url, ct);
        public async Task<string> UploadAsync(Stream stream, string key, string type, CancellationToken ct = default)
        {
            var url = await inner.UploadAsync(stream, key, type, ct);
            if (key.EndsWith("/thumbnail.jpg")) throw new IOException("test PUT accepted but acknowledgement lost");
            return url;
        }
    }
    private sealed class FailingRenderer : IImageVariantRenderer
    {
        public Task<(byte[] Medium, byte[] Thumbnail)> RenderAsync(Stream original, CancellationToken ct) => throw new IOException("private recipient/credentials must not reach Hangfire");
    }
    private sealed class BlockingRenderer : IImageVariantRenderer
    {
        public int Calls;
        public TaskCompletionSource Entered = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Gate = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public async Task<(byte[] Medium, byte[] Thumbnail)> RenderAsync(Stream original, CancellationToken ct)
        {
            Interlocked.Increment(ref Calls); Entered.TrySetResult(); await Gate.Task.WaitAsync(ct);
            return await new IsolatedImageRenderer().RenderAsync(original, ct);
        }
    }
}
