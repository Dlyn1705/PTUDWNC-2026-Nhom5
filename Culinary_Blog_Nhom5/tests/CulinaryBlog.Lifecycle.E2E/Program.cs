using System.Security.Claims;
using System.Text.Encodings.Web;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Logging;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Npgsql;
using CulinaryBlog.Testing;

// Isolated E2E process; these fixture auth/control endpoints are never added to the production API.
var configured = Environment.GetEnvironmentVariable("LIFECYCLE_TEST_CONNECTION")
    ?? throw new InvalidOperationException("Set LIFECYCLE_TEST_CONNECTION for an isolated PostgreSQL test server.");
await using var database = await PostgresTestDatabase.CreateAsync(configured, "culinary_lifecycle_test_");
var connection = new NpgsqlConnectionStringBuilder(database.ConnectionString);
var builder = WebApplication.CreateBuilder(args); builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> {
    ["ConnectionStrings:DefaultConnection"] = connection.ConnectionString,
    ["ConnectionStrings:Redis"] = Environment.GetEnvironmentVariable("LIFECYCLE_TEST_REDIS_URL") ?? "localhost:6379",
    ["Minio:AccessKey"] = "unused-test", ["Minio:SecretKey"] = "unused-test"
});
builder.Services.AddApplication(); builder.Services.AddInfrastructure(builder.Configuration); builder.Services.AddRecipeApiConfiguration();
builder.Services.PostConfigure<Microsoft.Extensions.Caching.StackExchangeRedis.RedisCacheOptions>(
    options => options.InstanceName = connection.Database + ":");
if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("LIFECYCLE_TEST_REDIS_URL")))
    builder.Services.AddSingleton<IDistributedCache>(new MemoryDistributedCache(Options.Create(new MemoryDistributedCacheOptions())));
builder.Services.AddScoped<IHealthDependencyProbe, HealthDependencyProbe>();
builder.Services.AddAuthentication("LifecycleFixture").AddScheme<AuthenticationSchemeOptions, FixtureAuthentication>("LifecycleFixture", _ => { });
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.SetIsOriginAllowed(origin =>
    Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.Host == "127.0.0.1").AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
await using var app = builder.Build();
app.UseCors(); app.UseMiddleware<CorrelationIdMiddleware>(); app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseRouting(); app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
var failure = 0; var delay = 0; var calls = 0;
var api = app.MapGroup("/api/v1");
api.AddEndpointFilter(async (context, next) => {
    if (context.HttpContext.Request.Method == "PATCH") {
        Interlocked.Increment(ref calls); if (delay > 0) await Task.Delay(delay);
        if (failure != 0) return Results.Problem(statusCode: failure, detail: "SECRET test failure");
    }
    return await next(context);
});
api.MapRecipeEndpoints(); api.MapCategoryEndpoints(); api.MapRecipeStepEndpoints(); api.MapRecipeIngredientEndpoints();
app.MapHealthEndpoints();
app.MapPost("/fixture/mode/{status:int}/{milliseconds:int}", (int status, int milliseconds) => { failure = status; delay = milliseconds; return Results.Ok(); });
app.MapGet("/fixture/calls", () => calls);
try
{
    using (var scope = app.Services.CreateScope()) {
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>(); await db.Database.MigrateAsync();
        var category = Category.Create("Món chính", "mon-chinh");
        db.AddRange(category, new ApplicationUser { Id = "owner", DisplayName = "Lifecycle Test" });
        var ordered = new List<Recipe>();
        for (var i = 0; i < 15; i++) {
            var recipe = Recipe.Create(i == 0 ? "Phở vòng đời" : i == 1 ? "Thiếu nguyên liệu" : $"Nháp {i:D2}",
                "lifecycle-" + i, "Công thức thử nghiệm", null, 5, 10, 2, RecipeDifficulty.Easy, category.Id, "owner");
            recipe.Steps.Add(RecipeStep.Create(recipe.Id, 1, "Nấu", "Nấu chín"));
            if (i != 1) recipe.Ingredients.Add(RecipeIngredient.Create(recipe.Id, "Muối", null, null));
            db.Add(recipe);
            ordered.Add(recipe);
        }
        await db.SaveChangesAsync();
        ordered[0].CreatedAt = DateTime.UtcNow.AddDays(1); ordered[1].CreatedAt = DateTime.UtcNow.AddHours(1);
        await db.SaveChangesAsync();
    }
    await app.StartAsync(); Console.WriteLine("LIFECYCLE_E2E_READY " + app.Urls.Single());
    await Console.In.ReadLineAsync(); await app.StopAsync();
}
finally {
    using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    if (db.Database.GetDbConnection().Database != connection.Database) throw new InvalidOperationException("Unsafe fixture database");
    await db.Database.EnsureDeletedAsync();
}

public sealed class FixtureAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync() {
        if (Request.Headers.Authorization != "Bearer lifecycle-e2e") return Task.FromResult(AuthenticateResult.NoResult());
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "owner"), new Claim(ClaimTypes.Role, "Author")], Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
