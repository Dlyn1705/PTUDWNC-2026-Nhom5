using System.Text;

using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Persistence.Seed;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using System.Threading.RateLimiting;
using Asp.Versioning;
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

var hangfireConnectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection must be configured for Hangfire.");
builder.Services.AddHangfire(configuration => configuration
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UsePostgreSqlStorage(options => options.UseNpgsqlConnection(hangfireConnectionString)));
builder.Services.AddHangfireServer();


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
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
{
    throw new InvalidOperationException("Jwt:Key must be configured with at least 32 UTF-8 bytes (use a secret store or Jwt__Key environment variable).");
}

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

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(
        "AuthorPolicy",
        policy => policy.RequireRole("Author", "Admin"));

    options.AddPolicy(
        "AdminPolicy",
        policy => policy.RequireRole("Admin"));
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 300,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});

builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
});

// 5. OpenAPI & Scalar Documentation
// ============================================================
builder.Services.AddOpenApi("v1");


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
app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = [new AdminDashboardAuthorizationFilter()]
});


// ============================================================
// 11. Map Endpoint Groups
// ============================================================
app.MapCategoryEndpoints();

app.MapAuthEndpoints();

app.MapRecipeEndpoints();
app.MapRecipeManagementEndpoints();

app.MapHealthEndpoints();


// ============================================================
// 12. Run
// ============================================================
app.Run();
