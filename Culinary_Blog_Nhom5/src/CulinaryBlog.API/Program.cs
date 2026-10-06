using System.Text;

using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Persistence.Seed;
using CulinaryBlog.Infrastructure.Services;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.IdentityModel.Tokens;
using System.Threading.RateLimiting;
using Hangfire;
using Hangfire.PostgreSql;
using Scalar.AspNetCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// ============================================================
// 1. Serilog Structured Logging
// ============================================================
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateLogger();

builder.Host.UseSerilog();


// ============================================================
// 2. Add Layers Dependency Injection
// ============================================================
builder.Services.AddApplication();

builder.Services.AddInfrastructure(
    builder.Configuration);

var databaseConnectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' was not found.");
builder.Services.AddHangfire(configuration => configuration
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UsePostgreSqlStorage(options => options.UseNpgsqlConnection(databaseConnectionString)));
builder.Services.AddHangfireServer();

if (builder.Environment.IsDevelopment())
{
    var keyDirectory = Path.Combine(
        builder.Environment.ContentRootPath,
        ".data-protection-keys");

    builder.Services
        .AddDataProtection()
        .SetApplicationName("CulinaryBlog")
        .PersistKeysToFileSystem(new DirectoryInfo(keyDirectory));
}


// ============================================================
// 3. CORS Configuration
// ============================================================
var allowedOrigins =
    builder.Configuration
        .GetSection("Cors:AllowedOrigins")
        .Get<string[]>()
    ?? new[]
    {
        "http://localhost:3000"
    };

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});


// ============================================================
// 4. Authentication (JWT Bearer) & Authorization
// ============================================================
var jwtKey =
    builder.Configuration["Jwt:Key"]
    ?? "CulinaryBlog_SuperSecretKey_For_Development_Must_Be_Long_Enough_2026";

var jwtIssuer =
    builder.Configuration["Jwt:Issuer"]
    ?? "CulinaryBlog";

var jwtAudience =
    builder.Configuration["Jwt:Audience"]
    ?? "CulinaryBlogWeb";

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme =
            JwtBearerDefaults.AuthenticationScheme;

        options.DefaultChallengeScheme =
            JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters =
            new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,

                ValidIssuer = jwtIssuer,
                ValidAudience = jwtAudience,

                IssuerSigningKey =
                    new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(jwtKey)),

                ClockSkew = TimeSpan.Zero
            };
    });

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    options.AddPolicy("upload", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});

// 5. OpenAPI & Scalar Documentation
// ============================================================
builder.Services.AddOpenApi();
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = 6 * 1024 * 1024);


// ============================================================
// Build Application
// ============================================================
var app = builder.Build();


// ============================================================
// 6. OPTIONAL DATABASE MIGRATION & SEEDING
// ============================================================
// Chỉ chạy khi Database:SeedOnStartup=true để không tự ý thay đổi
// database đã có dữ liệu trong lúc API khởi động.
// ============================================================
if (builder.Configuration.GetValue<bool>("Database:SeedOnStartup"))
{
    using var scope = app.Services.CreateScope();
    var services = scope.ServiceProvider;

    var context =
        services.GetRequiredService<ApplicationDbContext>();

    var userManager =
        services.GetRequiredService<UserManager<ApplicationUser>>();

    var roleManager =
        services.GetRequiredService<RoleManager<IdentityRole>>();

    await DatabaseSeeder.SeedAsync(
        context,
        userManager,
        roleManager);
}


// ============================================================
// 7. Request Pipeline & Middlewares
// ============================================================
app.UseMiddleware<CorrelationIdMiddleware>();

app.UseMiddleware<RequestAuditMiddleware>();

app.UseMiddleware<GlobalExceptionMiddleware>();

app.UseCors("AllowFrontend");


// ============================================================
// 8. OpenAPI / Scalar
// ============================================================
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    app.MapScalarApiReference();
}


// ============================================================
// 9. HTTPS
// ============================================================
app.UseHttpsRedirection();


// ============================================================
// 10. Authentication & Authorization
// ============================================================
app.UseAuthentication();

app.UseAuthorization();
app.UseRateLimiter();


// ============================================================
// 11. Map Endpoint Groups
// ============================================================
app.MapCategoryEndpoints();

app.MapAuthEndpoints();

app.MapRecipeEndpoints();

app.MapHealthEndpoints();

RecurringJob.AddOrUpdate<RecipeImageDeletionRecoveryJob>(
    "recover-pending-recipe-image-deletions",
    job => job.EnqueuePendingAsync(CancellationToken.None),
    Cron.MinuteInterval(5));


// ============================================================
// 12. Run
// ============================================================
app.Run();
