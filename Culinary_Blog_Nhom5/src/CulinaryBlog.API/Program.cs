using System.Text;
using Asp.Versioning;

using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Authorization;
using CulinaryBlog.API.Documentation;
using CulinaryBlog.API.Logging;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Persistence.Seed;
using CulinaryBlog.Infrastructure.Services;
using CulinaryBlog.Infrastructure.Services.Email;

using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using CulinaryBlog.API.Security;
using Hangfire;
using Hangfire.PostgreSql;
using Scalar.AspNetCore;
using Serilog;

// Private process mode; no web host, DB, Hangfire or application secrets are needed to transform pixels.
if (args.Length > 0 && args[0] == "--image-transform")
{
    Environment.ExitCode = CulinaryBlog.Infrastructure.Services.Images.ImageTransformWorker.Run(args);
    return;
}

Log.Logger = StructuredLoggingExtensions.CreateBootstrapLogger();
try
{
var builder = WebApplication.CreateBuilder(args);
builder.AddStructuredLogging();

// ============================================================
// 2. Add Layers Dependency Injection
// ============================================================
builder.Services.AddApplication();

builder.Services.AddInfrastructure(
    builder.Configuration);

builder.Services.AddObservability(builder.Configuration);

var databaseConnectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(databaseConnectionString))
    throw new InvalidOperationException("Configure ConnectionStrings:DefaultConnection through an environment variable or user secrets.");
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
        .Get<string[]>();

if (allowedOrigins is not { Length: > 0 } || allowedOrigins.Any(origin =>
        string.IsNullOrWhiteSpace(origin)
        || !Uri.TryCreate(origin, UriKind.Absolute, out var uri)
        || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        || !string.IsNullOrEmpty(uri.UserInfo)
        || origin.Contains('*')
        || !string.Equals(origin, uri.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase)))
    throw new InvalidOperationException("Configure Cors:AllowedOrigins with explicit HTTP(S) origins (scheme, host and optional port only).");

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod().WithExposedHeaders(RequestLogContext.CorrelationHeader, "Retry-After", "ETag", "api-supported-versions")
            .AllowCredentials();
    });
});


// ============================================================
// 4. Authentication (JWT Bearer) & Authorization
// ============================================================
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Configure Jwt:Key with at least 32 UTF-8 bytes through an environment variable or user secrets.");

var jwtIssuer =
    builder.Configuration["Jwt:Issuer"]
    ?? "CulinaryBlog";

if (!builder.Environment.IsDevelopment() && jwtKey.Contains("SuperSecretKey_For_Development", StringComparison.Ordinal))
    throw new InvalidOperationException("The development JWT key is not allowed outside Development.");

var jwtAudience =
    builder.Configuration["Jwt:Audience"]
    ?? "CulinaryBlogWeb";

var googleClientId = builder.Configuration["Authentication:Google:ClientId"];
var googleClientSecret = builder.Configuration["Authentication:Google:ClientSecret"];
var googleCallbackPath = builder.Configuration["Authentication:Google:CallbackPath"]
    ?? "/api/v1/auth/google/callback";

var authenticationBuilder = builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme =
            JwtBearerDefaults.AuthenticationScheme;

        options.DefaultChallengeScheme =
            JwtBearerDefaults.AuthenticationScheme;
    })
    .AddCookie(IdentityConstants.ExternalScheme, options =>
    {
        options.Cookie.Name = ".CulinaryBlog.External";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.Path = "/api/v1/auth";
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromMinutes(5);
        options.SlidingExpiration = false;
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

if (!string.IsNullOrWhiteSpace(googleClientId)
    && !string.IsNullOrWhiteSpace(googleClientSecret))
{
    authenticationBuilder.AddGoogle(options =>
    {
        options.ClientId = googleClientId;
        options.ClientSecret = googleClientSecret;
        options.SignInScheme = IdentityConstants.ExternalScheme;
        options.CallbackPath = googleCallbackPath;
        options.UsePkce = true;
        options.SaveTokens = false;
        options.Scope.Clear();
        options.Scope.Add("openid");
        options.Scope.Add("email");
        options.Scope.Add("profile");
        options.ClaimActions.MapJsonKey("email_verified", "verified_email");
        options.ClaimActions.MapJsonKey("picture", "picture");
        options.Events.OnRemoteFailure = async context =>
        {
            var isAccessDenied = context.Request.Query["error"] == "access_denied";
            var isGoogleUnavailable = false;
            for (var exception = context.Failure; exception is not null; exception = exception.InnerException)
            {
                if (exception is HttpRequestException or TimeoutException)
                {
                    isGoogleUnavailable = true;
                    break;
                }
            }

            var status = isAccessDenied
                ? StatusCodes.Status400BadRequest
                : isGoogleUnavailable
                    ? StatusCodes.Status502BadGateway
                    : StatusCodes.Status401Unauthorized;

            context.Response.StatusCode = status;
            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = status,
                Title = status switch
                {
                    StatusCodes.Status400BadRequest => "Google authorization was denied.",
                    StatusCodes.Status502BadGateway => "Google authentication service is unavailable.",
                    _ => "Google authorization code is invalid or expired."
                },
                Detail = status == StatusCodes.Status502BadGateway
                    ? "The server could not reach Google's token service. Please retry."
                    : "Google sign-in could not be completed. Please start again."
            });
            context.HandleResponse();
        };
    });
}

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(
        "AuthorPolicy",
        policy => policy.RequireRole("Author", "Admin"));

    options.AddPolicy(
        "AdminOnly",
        policy => policy.RequireRole("Admin"));
});

builder.Services.AddApiSecurity();

// 5. OpenAPI & Scalar Documentation
// ============================================================
builder.Services.AddApiVersioning(options =>
    {
        options.ApiVersionReader = new UrlSegmentApiVersionReader();
        options.ReportApiVersions = true;
    })
    .AddApiExplorer(options =>
    {
        options.GroupNameFormat = "'v'VVV";
        options.SubstituteApiVersionInUrl = true;
    })
    .AddOpenApi(options =>
    {
        options.Document.AddDocumentTransformer<BearerDocumentTransformer>();
        options.Document.AddOperationTransformer<AuthorizationOperationTransformer>();
    });
builder.Services.AddRecipeApiConfiguration();
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
        roleManager,
        builder.Configuration);
}

else if (app.Environment.IsDevelopment() || builder.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope();
    var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await context.Database.MigrateAsync();
}

if (builder.Configuration.GetValue<bool>("AdminSeed:OnStartup"))
{
    using var scope = app.Services.CreateScope();
    var services = scope.ServiceProvider;
    await AdminSeeder.SeedAsync(
        services.GetRequiredService<UserManager<ApplicationUser>>(),
        services.GetRequiredService<RoleManager<IdentityRole>>(),
        builder.Configuration);
}


// ============================================================
// 7. Request Pipeline & Middlewares
// ============================================================
app.UseMiddleware<ApiSecurityHeadersMiddleware>();
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseStructuredRequestLogging();

app.UseMiddleware<RequestAuditMiddleware>();

app.UseMiddleware<GlobalExceptionMiddleware>();

app.UseCors("AllowFrontend");


// ============================================================
// 8. OpenAPI / Scalar
// ============================================================
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().WithDocumentPerVersion();

    app.MapScalarApiReference(options =>
    {
        var descriptions = app.DescribeApiVersions();
        for (var i = 0; i < descriptions.Count; i++)
        {
            var description = descriptions[i];
            options.AddDocument(description.GroupName, description.GroupName,
                isDefault: i == descriptions.Count - 1);
        }
    });
}


// ============================================================
// 9. HTTPS
// ============================================================
app.UseHttpsRedirection();


// ============================================================
// 10. Authentication & Authorization
// ============================================================
app.UseAuthentication();
app.UseMiddleware<UserLogContextMiddleware>();

app.UseRateLimiter();
app.UseAuthorization();

app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = [new AdminHangfireDashboardAuthorizationFilter()]
});


// ============================================================
// 11. Map Endpoint Groups
// ============================================================
var api = app.NewVersionedApi();
var v1 = api.MapGroup("/api/v{version:apiVersion}").HasApiVersion(1.0);

v1.MapCategoryEndpoints();

v1.MapAuthEndpoints();

v1.MapAdminEndpoints();

v1.MapRecipeEndpoints();
v1.MapRecipeIngredientEndpoints();

CulinaryBlog.Infrastructure.Services.Images.ImageProcessingRegistration.RegisterImageProcessingJobs(
    app.Services.GetRequiredService<IRecurringJobManager>());
app.MapHealthEndpoints();

var recurringJobManager = app.Services.GetRequiredService<IRecurringJobManager>();
recurringJobManager.AddOrUpdate<RecipeImageProcessingRecoveryJob>(
    "recover-pending-recipe-image-processing",
    job => job.EnqueuePendingAsync(CancellationToken.None),
    Cron.MinuteInterval(5),
    new RecurringJobOptions());
recurringJobManager.AddOrUpdate<RecipeImageDeletionRecoveryJob>(
    "recover-pending-recipe-image-deletions",
    job => job.EnqueuePendingAsync(CancellationToken.None),
    Cron.MinuteInterval(5),
    new RecurringJobOptions());

recurringJobManager.AddOrUpdate<PurgeDeletedRecipesJob>(
    "purge-deleted-recipes",
    job => job.RunAsync(CancellationToken.None),
    Cron.Weekly,
    new RecurringJobOptions());

recurringJobManager.RegisterWelcomeEmailJobs();

// ============================================================
// 12. Run
// ============================================================
await app.RunAsync();
}
catch (Exception exception)
{
    Log.Fatal(exception, "Application terminated unexpectedly");
    Environment.ExitCode = 1;
}
finally
{
    await Log.CloseAndFlushAsync();
}

public partial class Program { }
