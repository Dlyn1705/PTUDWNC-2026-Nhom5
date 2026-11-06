using System.Text;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Testing;
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
var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
    ["ConnectionStrings:DefaultConnection"] = database.ConnectionString,
    ["Jwt:Key"] = key, ["Jwt:Issuer"] = "critical-tests", ["Jwt:Audience"] = "critical-tests",
    ["Minio:AccessKey"] = "test-only", ["Minio:SecretKey"] = "test-only", ["Email:Enabled"] = "false" });
builder.Services.AddApplication().AddInfrastructure(builder.Configuration);
builder.Services.AddRecipeApiConfiguration();
builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("auth", policy => {
    policy.PermitLimit = 10; policy.Window = TimeSpan.FromMinutes(1); policy.QueueLimit = 0;
}));
builder.Services.AddSingleton<IDistributedCache>(new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions())));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
    options.TokenValidationParameters = new TokenValidationParameters {
        ValidateIssuer = true, ValidIssuer = "critical-tests", ValidateAudience = true, ValidAudience = "critical-tests",
        ValidateLifetime = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)) });
await using var app = builder.Build();
app.UseMiddleware<CorrelationIdMiddleware>(); app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseRouting(); app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
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
