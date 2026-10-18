using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Commands.UploadRecipeImage;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Persistence.Interceptors;
using CulinaryBlog.Infrastructure.Services;
using CulinaryBlog.Infrastructure.Services.Images;
using ImageMagick;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Minio;
using Minio.DataModel.Args;
using Npgsql;
using Xunit;

namespace CulinaryBlog.RecipeImages.Tests;

public sealed class StorageLifecycleTests
{
    [Fact]
    public async Task Minio_upload_resize_delete_and_soft_deleted_recipe_retention()
    {
        var configured = Environment.GetEnvironmentVariable("RECIPE_IMAGES_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set RECIPE_IMAGES_TEST_CONNECTION.");
        var bucket = "fr-rcp008-test-" + Guid.NewGuid().ToString("N");
        var dbConnection = new NpgsqlConnectionStringBuilder(configured) { Database = "fr_rcp008_test_" + Guid.NewGuid().ToString("N") };
        var adminConnection = new NpgsqlConnectionStringBuilder(configured) { Database = "postgres" };
        await using (var admin = new NpgsqlConnection(adminConnection.ConnectionString))
        {
            await admin.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{dbConnection.Database}\"", admin);
            await create.ExecuteNonQueryAsync();
        }

        using var client = new MinioClient().WithEndpoint("localhost:9000")
            .WithCredentials(Environment.GetEnvironmentVariable("RECIPE_IMAGES_TEST_MINIO_USER")
                ?? throw new InvalidOperationException("Set RECIPE_IMAGES_TEST_MINIO_USER."),
                Environment.GetEnvironmentVariable("RECIPE_IMAGES_TEST_MINIO_PASSWORD")
                ?? throw new InvalidOperationException("Set RECIPE_IMAGES_TEST_MINIO_PASSWORD."))
            .Build();
        var minioOptions = Options.Create(new MinioOptions { PublicBaseUrl = "http://localhost:9000", Bucket = bucket });
        var storage = new MinioFileStorageService(client, minioOptions);
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(dbConnection.ConnectionString, npgsql =>
                npgsql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName))
            .AddInterceptors(new AuditInterceptor()));
        services.AddSingleton<IFileStorageService>(storage);
        services.Configure<MinioOptions>(options =>
        {
            options.PublicBaseUrl = minioOptions.Value.PublicBaseUrl;
            options.Bucket = minioOptions.Value.Bucket;
        });
        services.AddImageProcessing();
        services.AddTransient<RecipeImageProcessingJob>();
        services.AddTransient<RecipeImageDeletionJob>();
        await using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var uploadedUrls = new HashSet<string>();
        try
        {
            await db.Database.MigrateAsync();
            var owner = new ApplicationUser { DisplayName = "Storage test owner" };
            var category = Category.Create("Storage test", "storage-test");
            var recipe = Recipe.Create("Storage", "storage", "description", "instructions", 1, 1, 1,
                RecipeDifficulty.Easy, category.Id, owner.Id);
            db.AddRange(owner, category, recipe);
            await db.SaveChangesAsync();
            var user = new User(owner.Id);
            var mutations = new RecipeImageMutations(provider.GetRequiredService<IServiceScopeFactory>(), user);
            var unit = new UnitOfWork(db, provider.GetRequiredService<IServiceScopeFactory>());
            // Deliberately unavailable queue: upload must still succeed with durable Pending metadata.
            var handler = new UploadRecipeImageCommandHandler(unit, user, storage, mutations,
                new UnavailableQueue(), NullLogger<UploadRecipeImageCommandHandler>.Instance);
            foreach (var format in new[] { MagickFormat.Jpeg, MagickFormat.Png, MagickFormat.WebP, MagickFormat.Avif })
            {
                using var source = new MagickImage(MagickColors.Orange, 640, 360) { Format = format };
                await using var stream = new MemoryStream(source.ToByteArray());
                var ext = format == MagickFormat.Jpeg ? "jpg" : format.ToString().ToLowerInvariant();
                var mime = format == MagickFormat.Jpeg ? "image/jpeg" : "image/" + ext;
                var result = await handler.Handle(new UploadRecipeImageCommand(recipe.Id, stream,
                    "photo." + ext, mime, stream.Length, "Món ăn thử nghiệm"), default);
                uploadedUrls.Add(result.OriginalUrl);
                Assert.Equal("Pending", result.ProcessingStatus);
                using var processingScope = provider.CreateScope();
                var processingDb = processingScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var job = processingScope.ServiceProvider.GetRequiredService<RecipeImageProcessingJob>();
                await job.ProcessAsync(result.Id, default);
                await job.ProcessAsync(result.Id, default); // Retry is idempotent.
                var processed = await processingDb.RecipeImages.AsNoTracking().SingleAsync(x => x.Id == result.Id);
                uploadedUrls.Add(processed.MediumUrl!);
                uploadedUrls.Add(processed.ThumbnailUrl!);
                Assert.Equal("Completed", processed.ProcessingStatus);
                await using (var medium = await storage.OpenReadAsync(processed.MediumUrl!))
                using (var decoded = new MagickImage(medium))
                { Assert.Equal(800u, decoded.Width); Assert.Equal(600u, decoded.Height); }
                await using (var thumbnail = await storage.OpenReadAsync(processed.ThumbnailUrl!))
                using (var decoded = new MagickImage(thumbnail))
                { Assert.Equal(300u, decoded.Width); Assert.Equal(300u, decoded.Height); }

                await mutations.DeleteAsync(recipe.Id, result.Id, default);
                processingDb.ChangeTracker.Clear();
                var deletion = processingScope.ServiceProvider.GetRequiredService<RecipeImageDeletionJob>();
                await deletion.DeleteAsync(result.Id, default);
                await deletion.DeleteAsync(result.Id, default);
                using var http = new HttpClient();
                Assert.Equal(System.Net.HttpStatusCode.NotFound, (await http.GetAsync(result.OriginalUrl)).StatusCode);
                Assert.Equal(System.Net.HttpStatusCode.NotFound, (await http.GetAsync(processed.MediumUrl)).StatusCode);
                Assert.Equal(System.Net.HttpStatusCode.NotFound, (await http.GetAsync(processed.ThumbnailUrl)).StatusCode);
            }

            await using var invalid = new MemoryStream([1, 2, 3, 4]);
            await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(new UploadRecipeImageCommand(
                recipe.Id, invalid, "fake.jpg", "image/jpeg", invalid.Length, null), default));
            await Assert.ThrowsAsync<ValidationException>(() => handler.Handle(new UploadRecipeImageCommand(
                recipe.Id, invalid, "fake.jpg", "image/jpeg", 5 * 1024 * 1024 + 1, null), default));

            // A valid signature alone cannot guarantee decoding: preserve the original on job failure.
            await using var corrupt = new MemoryStream([137, 80, 78, 71, 13, 10, 26, 10]);
            var failed = await handler.Handle(new UploadRecipeImageCommand(recipe.Id, corrupt,
                "corrupt.png", "image/png", corrupt.Length, null), default);
            uploadedUrls.Add(failed.OriginalUrl);
            using (var failedScope = provider.CreateScope())
            {
                var failedDb = failedScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var failedJob = failedScope.ServiceProvider.GetRequiredService<RecipeImageProcessingJob>();
                await failedJob.ProcessAsync(failed.Id, default);
                failedDb.ChangeTracker.Clear();
                var metadata = await failedDb.RecipeImages.SingleAsync(x => x.Id == failed.Id);
                Assert.Equal("Failed", metadata.ProcessingStatus);
                await using var preserved = await storage.OpenReadAsync(metadata.OriginalUrl);
                Assert.True(preserved.Length > 0);
                await mutations.DeleteAsync(recipe.Id, failed.Id, default);
                failedDb.ChangeTracker.Clear();
                await failedScope.ServiceProvider.GetRequiredService<RecipeImageDeletionJob>()
                    .DeleteAsync(failed.Id, default);
            }

            // Soft-deleting a whole recipe keeps the original object available for the retention period.
            using var retainedSource = new MagickImage(MagickColors.Red, 30, 30) { Format = MagickFormat.Png };
            await using var retainedStream = new MemoryStream(retainedSource.ToByteArray());
            var retained = await handler.Handle(new UploadRecipeImageCommand(recipe.Id, retainedStream,
                "retained.png", "image/png", retainedStream.Length, null), default);
            uploadedUrls.Add(retained.OriginalUrl);
            db.ChangeTracker.Clear();
            var softDeleted = await db.Recipes.SingleAsync();
            softDeleted.SoftDelete();
            await db.SaveChangesAsync();
            await using var original = await storage.OpenReadAsync(retained.OriginalUrl);
            Assert.True(original.Length > 0);
        }
        finally
        {
            // Only this test's uniquely named bucket/database are removed.
            foreach (var url in uploadedUrls) await storage.DeleteAsync(url);
            if (await client.BucketExistsAsync(new BucketExistsArgs().WithBucket(bucket)))
                await client.RemoveBucketAsync(new RemoveBucketArgs().WithBucket(bucket));
            await db.Database.EnsureDeletedAsync();
        }
    }

    private sealed record User(string? UserId) : ICurrentUserService
    {
        public string? Email => null;
        public IReadOnlyList<string> Roles => ["Author"];
        public bool IsAuthenticated => true;
        public bool IsAdmin => false;
    }
    private sealed class UnavailableQueue : IRecipeImageProcessingQueue
    {
        public Task EnqueueAsync(Guid imageId, CancellationToken cancellationToken = default) =>
            throw new IOException("Simulated queue outage");
    }
}
