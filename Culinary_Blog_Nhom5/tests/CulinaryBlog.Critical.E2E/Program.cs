using System.Text;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Testing;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

// Test process only: real production routes/services/JWT and a disposable PostgreSQL database.
var connection = Environment.GetEnvironmentVariable("CRITICAL_TEST_CONNECTION")
    ?? throw new InvalidOperationException("Set CRITICAL_TEST_CONNECTION for an isolated PostgreSQL server.");
await using var database = await PostgresTestDatabase.CreateAsync(connection, "culinary_critical_test_");
const string key = "Isolated-critical-tests-key-at-least-64-characters-not-a-production-secret";
var browserOrigin = Environment.GetEnvironmentVariable("CRITICAL_BROWSER_ORIGIN");
var minioEndpoint = Environment.GetEnvironmentVariable("CRITICAL_TEST_MINIO_ENDPOINT");
var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
    ["ConnectionStrings:DefaultConnection"] = database.ConnectionString,
    ["Jwt:Key"] = key, ["Jwt:Issuer"] = "critical-tests", ["Jwt:Audience"] = "critical-tests",
    ["Minio:Endpoint"] = minioEndpoint ?? "127.0.0.1:9000",
    ["Minio:PublicBaseUrl"] = "http://" + (minioEndpoint ?? "127.0.0.1:9000"),
    ["Minio:Bucket"] = $"critical-e2e-{Guid.NewGuid():N}",
    ["Minio:AccessKey"] = Environment.GetEnvironmentVariable("CRITICAL_TEST_MINIO_USER") ?? "test-only",
    ["Minio:SecretKey"] = Environment.GetEnvironmentVariable("CRITICAL_TEST_MINIO_PASSWORD") ?? "test-only",
    ["Email:Enabled"] = "false" });
builder.Services.AddApplication().AddInfrastructure(builder.Configuration);
if (browserOrigin is not null)
{
    if (minioEndpoint is null)
        throw new InvalidOperationException("Set CRITICAL_TEST_MINIO_ENDPOINT for the isolated browser upload test.");
    builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
        policy.WithOrigins(browserOrigin).AllowAnyHeader().AllowAnyMethod().AllowCredentials()
            .WithExposedHeaders("ETag", "X-Correlation-ID", "Retry-After")));
    builder.Services.AddHangfire(config => config.UsePostgreSqlStorage(options => options.UseNpgsqlConnection(database.ConnectionString)));
    builder.Services.AddHangfireServer(options =>
    {
        options.WorkerCount = 2;
        options.SchedulePollingInterval = TimeSpan.FromSeconds(1);
    });
}
builder.Services.AddRecipeApiConfiguration();
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("upload", policy =>
    {
        policy.PermitLimit = 30;
        policy.Window = TimeSpan.FromMinutes(1);
        policy.QueueLimit = 0;
    });
    options.AddFixedWindowLimiter("auth", policy =>
    {
        // The browser and HTTP journeys share a fixture and run from the same loopback address.
        policy.PermitLimit = browserOrigin is null ? 10 : 20;
        policy.Window = TimeSpan.FromMinutes(1);
        policy.QueueLimit = 0;
    });
});
builder.Services.AddSingleton<IDistributedCache>(new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions())));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
    options.TokenValidationParameters = new TokenValidationParameters {
        ValidateIssuer = true, ValidIssuer = "critical-tests", ValidateAudience = true, ValidAudience = "critical-tests",
        ValidateLifetime = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)) });
await using var app = builder.Build();
app.UseMiddleware<CorrelationIdMiddleware>(); app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseRouting();
if (browserOrigin is not null) app.UseCors();
app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
var api = app.MapGroup("/api/v1");
api.MapAuthEndpoints(); api.MapCategoryEndpoints(); api.MapRecipeEndpoints();
api.MapRecipeIngredientEndpoints(); api.MapRecipeStepEndpoints();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await db.Database.MigrateAsync();
    var category = Category.Create("Critical E2E", "critical-e2e");
    category.Id = Guid.Parse("11111111-1111-4111-8111-111111111111");
    db.Categories.Add(category); await db.SaveChangesAsync();
}
await app.StartAsync();
try
{
    Console.WriteLine("CRITICAL_E2E_READY " + app.Urls.Single());
    await Console.In.ReadLineAsync();
}
finally { await app.StopAsync(); }
