using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Hangfire;
using Hangfire.PostgreSql;
using Npgsql;

// Fault endpoints exist only in this test project. Never deployed with the API.
var connection = Environment.GetEnvironmentVariable("RELIABILITY_TEST_CONNECTION") ?? throw new InvalidOperationException("Test connection required");
var parsed = new NpgsqlConnectionStringBuilder(connection);
if (!System.Text.RegularExpressions.Regex.IsMatch(parsed.Database ?? "", "^issue88_(source|restore)_[a-f0-9]{8,32}$")) throw new InvalidOperationException("Isolated target required");
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("RELIABILITY_TEST_URL") ?? "http://127.0.0.1:0");
builder.Logging.ClearProviders();
builder.Configuration.AddInMemoryCollection(new Dictionary<string,string?> {
    ["ConnectionStrings:DefaultConnection"]=connection,
    ["ConnectionStrings:Redis"]=Environment.GetEnvironmentVariable("RELIABILITY_REDIS"),
    ["Minio:Endpoint"]=Environment.GetEnvironmentVariable("RELIABILITY_MINIO"),
    ["Minio:AccessKey"]="issue88test", ["Minio:SecretKey"]="issue88-test-secret",
    ["Minio:Bucket"]=Environment.GetEnvironmentVariable("RELIABILITY_BUCKET")
});
builder.Services.AddApplication(); builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddRecipeApiConfiguration(); builder.Services.AddAuthentication();
builder.Services.AddScoped<IHealthDependencyProbe, HealthDependencyProbe>();
builder.Services.AddHangfire(c => c.UsePostgreSqlStorage(o=>o.UseNpgsqlConnection(connection)));
await using var app=builder.Build();
app.UseMiddleware<CorrelationIdMiddleware>(); app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseRouting(); app.UseAuthentication(); app.UseAuthorization(); app.UseRateLimiter();
app.MapHealthEndpoints(); var api=app.MapGroup("/api/v1"); api.MapRecipeEndpoints(); api.MapCategoryEndpoints();
app.MapGet("/test/unhandled", () => Task.FromException<IResult>(new InvalidOperationException("SECRET_INTERNAL")));
app.MapPost("/test/change", async (ApplicationDbContext db) => {
    var recipe=await db.Recipes.FirstAsync(); recipe.Title="Updated reliable recipe"; await db.SaveChangesAsync(); return Results.Ok();
});
app.MapGet("/test/cache", async (Microsoft.Extensions.Caching.Distributed.IDistributedCache cache) => {
    var value=await cache.GetAsync("sentinel"); if(value is null) await cache.SetAsync("sentinel",new byte[]{1},new());
    return new {hit=value is not null};
});
app.MapPost("/test/invalidate", async (CulinaryBlog.Application.Contracts.IPublicContentCache cache) => {
    await cache.InvalidateRecipesAsync(); await cache.InvalidateCategoriesAsync(); return Results.Ok();
});
app.MapGet("/test/cancel", async (Microsoft.Extensions.Caching.Distributed.IDistributedCache cache) => {
    using var cancel=new CancellationTokenSource(); cancel.Cancel();
    try { await cache.GetAsync("canceled",cancel.Token); return Results.Ok(new {canceled=false}); }
    catch(OperationCanceledException) { return Results.Ok(new {canceled=true}); }
});
app.MapPost("/test/race", async (IServiceScopeFactory scopes) => {
    using var reader=scopes.CreateScope(); using var writer=scopes.CreateScope();
    var stale=reader.ServiceProvider.GetRequiredService<Microsoft.Extensions.Caching.Distributed.IDistributedCache>();
    await stale.GetAsync("race");
    await writer.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.ExecuteSqlRawAsync("UPDATE \"Recipes\" SET \"Title\"=\"Title\"");
    await stale.SetAsync("race",new byte[]{9},new());
    using var fresh=scopes.CreateScope();
    var value=await fresh.ServiceProvider.GetRequiredService<Microsoft.Extensions.Caching.Distributed.IDistributedCache>().GetAsync("race");
    return Results.Ok(new {staleReachable=value is not null});
});
using(var scope=app.Services.CreateScope()) {
    var db=scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await db.Database.MigrateAsync();
    if (!await db.Recipes.AnyAsync()) {
        var category=Category.Create("Reliability", "reliability");
        db.AddRange(category,new ApplicationUser{Id="issue88-user",UserName="fixture",DisplayName="Fixture"});
        var recipe=Recipe.Create("Reliable recipe","reliable-recipe","Fixture",null,1,5,2,RecipeDifficulty.Easy,category.Id,"issue88-user");
        recipe.Status=RecipeStatus.Published; recipe.Steps.Add(RecipeStep.Create(recipe.Id,1,"Cook","Cook"));
        recipe.Ingredients.Add(RecipeIngredient.Create(recipe.Id,"Salt",null,null)); db.Add(recipe); await db.SaveChangesAsync();
        db.Add(new RefreshToken { UserId="issue88-user",TokenHash=new string('a',64),ExpiresAt=DateTime.UtcNow.AddDays(1) });
        await db.SaveChangesAsync();
    }
    // Instantiate the actual Hangfire PostgreSQL schema; no worker executes restored jobs.
    var jobs=scope.ServiceProvider.GetRequiredService<IBackgroundJobClient>();
    if (Environment.GetEnvironmentVariable("RELIABILITY_SEED_JOB")=="1") jobs.Enqueue(()=>Console.WriteLine("issue88 harmless sentinel"));
}
await app.StartAsync(); Console.WriteLine("RELIABILITY_READY "+app.Urls.Single()); await app.WaitForShutdownAsync();
