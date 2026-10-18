using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Encodings.Web;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Services;
using CulinaryBlog.Infrastructure.Services.Images;
using Hangfire;
using Hangfire.PostgreSql;
using ImageMagick;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Minio;
using Minio.DataModel.Args;
using Npgsql;
using Xunit;

[assembly: CollectionBehavior(DisableTestParallelization = true)]
namespace CulinaryBlog.ImageProcessing.Tests;

internal sealed class ImageTestApp(WebApplication app, string admin, string database, string bucket) : IAsyncDisposable
{
    public IServiceProvider Services => app.Services;
    public Guid RecipeId { get; private set; }
    public string UserId { get; private set; } = "";
    public FakeClock Clock => Services.GetRequiredService<FakeClock>();
    public static async Task<ImageTestApp> CreateAsync(bool worker = false, Action<IServiceCollection>? configure = null)
    {
        var cs = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("IMAGE_TEST_CONNECTION") ?? throw new InvalidOperationException("Set IMAGE_TEST_CONNECTION for local PostgreSQL tests.")) { Database = "postgres" };
        if (cs.Host is not ("localhost" or "127.0.0.1")) throw new InvalidOperationException("Only local PostgreSQL is allowed.");
        var database = "fr_job002_test_" + Guid.NewGuid().ToString("N");
        await using (var admin = new NpgsqlConnection(cs.ConnectionString))
        {
            await admin.OpenAsync(); await using var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", admin); await create.ExecuteNonQueryAsync();
        }
        var connection = new NpgsqlConnectionStringBuilder(cs.ConnectionString) { Database = database }.ConnectionString;
        var bucket = "fr-job002-test-" + Guid.NewGuid().ToString("N");
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.WebHost.UseTestServer(); builder.Logging.ClearProviders();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = connection,
            ["Jwt:Key"] = "image-tests-only-32-character-or-longer-key",
            ["Minio:Endpoint"] = "127.0.0.1:9000", ["Minio:PublicBaseUrl"] = "http://127.0.0.1:9000", ["Minio:Bucket"] = bucket,
            ["Minio:AccessKey"] = Environment.GetEnvironmentVariable("IMAGE_TEST_MINIO_ACCESS"),
            ["Minio:SecretKey"] = Environment.GetEnvironmentVariable("IMAGE_TEST_MINIO_SECRET")
        });
        builder.Services.AddApplication().AddInfrastructure(builder.Configuration);
        builder.Services.AddSingleton<FakeClock>(); builder.Services.AddSingleton<TimeProvider>(sp => sp.GetRequiredService<FakeClock>());
        builder.Services.AddAuthentication("test").AddScheme<AuthenticationSchemeOptions, TestAuthentication>("test", _ => { });
        builder.Services.AddRateLimiter(options =>
        {
            options.AddConcurrencyLimiter("upload", policy => policy.PermitLimit = 100);
            options.AddConcurrencyLimiter("recipe-read", policy => policy.PermitLimit = 100);
            options.AddConcurrencyLimiter("recipe-write", policy => policy.PermitLimit = 100);
        });
        builder.Services.AddHangfire(config => config.UsePostgreSqlStorage(options => options.UseNpgsqlConnection(connection)));
        if (worker) builder.Services.AddHangfireServer(options => { options.WorkerCount = 2; options.SchedulePollingInterval = TimeSpan.FromSeconds(1); });
        configure?.Invoke(builder.Services);
        var app = builder.Build(); app.UseMiddleware<GlobalExceptionMiddleware>(); app.UseRateLimiter(); app.UseAuthentication(); app.UseAuthorization();
        app.MapGroup("/api/v1").MapRecipeEndpoints();
        using (var scope = app.Services.CreateScope()) await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
        var test = new ImageTestApp(app, cs.ConnectionString, database, bucket);
        await test.Db(async db =>
        {
            var user = ApplicationUser.Create("author@image.test", "author@image.test", "Bếp Việt");
            var category = Category.Create("Test", Guid.NewGuid().ToString("N"));
            var recipe = new Recipe { Title = "Recipe", Slug = Guid.NewGuid().ToString("N"), Description = "Recipe", Instructions = "Instructions", AuthorId = user.Id, CategoryId = category.Id };
            db.Users.Add(user); db.Categories.Add(category); db.Recipes.Add(recipe);
            test.RecipeId = recipe.Id; test.UserId = user.Id; return await db.SaveChangesAsync();
        });
        await app.StartAsync(); return test;
    }

    public HttpClient Client(string? user = null, string role = "Author")
    {
        var client = app.GetTestClient(); client.DefaultRequestHeaders.Add("X-Test-User", user ?? UserId); client.DefaultRequestHeaders.Add("X-Test-Role", role); return client;
    }
    public async Task<T> Db<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = Services.CreateScope(); return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }
    public async Task Run<T>(Func<T, Task> action) where T : notnull
    {
        using var scope = Services.CreateScope(); await action(scope.ServiceProvider.GetRequiredService<T>());
    }
    public Task<RecipeImage> Image(Guid id) => Db(db => db.RecipeImages.IgnoreQueryFilters().AsNoTracking().SingleAsync(x => x.Id == id));
    public Task<RecipeImageWork> Work(Guid id) => Db(db => db.RecipeImageWork.AsNoTracking().SingleAsync(x => x.ImageId == id));
    public async Task<RecipeImageDto> UploadAsync(byte[]? bytes = null, string mime = "image/png", string filename = "test.png")
    {
        bytes ??= Sample(MagickFormat.Png);
        using var form = new MultipartFormDataContent(); using var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(mime); form.Add(content, "file", filename); form.Add(new StringContent("Món ăn Việt"), "altText");
        using var response = await Client().PostAsync($"/api/v1/recipes/{RecipeId}/images", form);
        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        using var json = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var result = System.Text.Json.JsonSerializer.Deserialize<RecipeImageDto>(json.RootElement.GetProperty("data").GetRawText(), new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        Clock.Reset();
        return result;
    }
    public static byte[] Sample(MagickFormat format, uint width = 1200, uint height = 400)
    {
        using var image = new MagickImage(MagickColors.Orange, width, height); image.Format = format; return image.ToByteArray();
    }
    public async Task WaitAsync(Func<Task<bool>> ready)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(50));
        while (!await ready()) await Task.Delay(100, timeout.Token);
    }
    public async ValueTask DisposeAsync()
    {
        await app.StopAsync();
        var minio = Services.GetRequiredService<IMinioClient>();
        if (await minio.BucketExistsAsync(new BucketExistsArgs().WithBucket(bucket)))
        {
            await foreach (var item in minio.ListObjectsEnumAsync(new ListObjectsArgs().WithBucket(bucket).WithRecursive(true)))
                await minio.RemoveObjectAsync(new RemoveObjectArgs().WithBucket(bucket).WithObject(item.Key));
            await minio.RemoveBucketAsync(new RemoveBucketArgs().WithBucket(bucket));
        }
        await app.DisposeAsync();
        await using var connection = new NpgsqlConnection(admin); await connection.OpenAsync();
        await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", connection); await drop.ExecuteNonQueryAsync();
    }
}

internal sealed class FakeClock : TimeProvider
{
    private DateTimeOffset now = DateTimeOffset.UtcNow.AddSeconds(10);
    public override DateTimeOffset GetUtcNow() => now;
    public void Reset() => now = DateTimeOffset.UtcNow.AddSeconds(1);
    public void Advance(int seconds) => now = now.AddSeconds(seconds);
}

internal sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var user = Request.Headers["X-Test-User"].ToString();
        if (string.IsNullOrEmpty(user)) return Task.FromResult(AuthenticateResult.NoResult());
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user), new Claim("userId", user), new Claim(ClaimTypes.Role, Request.Headers["X-Test-Role"].ToString())], "test"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, "test")));
    }
}
