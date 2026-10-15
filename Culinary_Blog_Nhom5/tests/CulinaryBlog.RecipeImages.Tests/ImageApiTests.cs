using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace CulinaryBlog.RecipeImages.Tests;

public sealed class ImageApiTests
{
    [Fact]
    public async Task Actual_image_routes_enforce_roles_ownership_and_primary_contract()
    {
        var configured = Environment.GetEnvironmentVariable("RECIPE_IMAGES_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set RECIPE_IMAGES_TEST_CONNECTION.");
        var connection = new NpgsqlConnectionStringBuilder(configured) { Database = "fr_rcp008_test_" + Guid.NewGuid().ToString("N") };
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = connection.ConnectionString,
            ["Minio:AccessKey"] = "test-not-used", ["Minio:SecretKey"] = "test-not-used"
        });
        builder.Logging.ClearProviders();
        builder.Services.AddApplication();
        builder.Services.AddInfrastructure(builder.Configuration);
        builder.Services.AddAuthentication("GalleryTest").AddScheme<AuthenticationSchemeOptions, TestAuthentication>("GalleryTest", _ => { });
        builder.Services.AddRateLimiter(options => options.AddConcurrencyLimiter("upload", limiter => limiter.PermitLimit = 10));
        builder.Services.AddScoped<IRecipeImageDeletionQueue, NoopDeletionQueue>();
        builder.Services.AddScoped<IRecipeImageProcessingQueue, NoopProcessingQueue>();
        await using var app = builder.Build();
        app.UseMiddleware<GlobalExceptionMiddleware>();
        app.UseRouting();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.MapGroup("/api/v1").MapRecipeEndpoints();
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        try
        {
            await db.Database.EnsureCreatedAsync();
            var owner = new ApplicationUser { Id = "gallery-owner", DisplayName = "Gallery owner" };
            var category = Category.Create("API test", "api-test");
            var recipe = Recipe.Create("API", "api-gallery", "description", "instructions", 1, 1, 1,
                RecipeDifficulty.Easy, category.Id, owner.Id);
            var first = RecipeImage.Create(recipe.Id, "http://example.test/first.jpg", isPrimary: true);
            var second = RecipeImage.Create(recipe.Id, "http://example.test/second.jpg", orderIndex: 1);
            db.AddRange(owner, category, recipe, first, second);
            await db.SaveChangesAsync();
            await app.StartAsync();
            using var client = app.GetTestClient();
            var route = $"/api/v1/recipes/{recipe.Id}/images";
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(route)).StatusCode);
            client.DefaultRequestHeaders.Add("X-Test-User", "other");
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(route)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.PatchAsync($"{route}/{second.Id}/primary", null)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync($"{route}/{first.Id}")).StatusCode);
            client.DefaultRequestHeaders.Remove("X-Test-User");
            client.DefaultRequestHeaders.Add("X-Test-User", owner.Id);
            var list = await client.GetFromJsonAsync<ApiResponse<List<RecipeImageDto>>>(route);
            Assert.Equal(2, list!.Data!.Count);
            using var form = new MultipartFormDataContent();
            using var invalidFile = new ByteArrayContent([1, 2, 3]);
            invalidFile.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");
            form.Add(invalidFile, "file", "fake.jpg");
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync(route, form)).StatusCode);
            var changed = await client.PatchAsync($"{route}/{second.Id}/primary", null);
            Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
            Assert.True((await changed.Content.ReadFromJsonAsync<ApiResponse<RecipeImageDto>>())!.Data!.IsPrimary);
            Assert.Equal(HttpStatusCode.OK, (await client.PatchAsync($"{route}/{second.Id}/primary", null)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.PatchAsync($"{route}/{Guid.NewGuid()}/primary", null)).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{route}/{second.Id}")).StatusCode);
            list = await client.GetFromJsonAsync<ApiResponse<List<RecipeImageDto>>>(route);
            Assert.Equal(first.Id, Assert.Single(list!.Data!).Id);
            Assert.True(list.Data![0].IsPrimary);
            Assert.Equal("no-store", (await client.GetAsync(route)).Headers.CacheControl!.ToString());
            client.DefaultRequestHeaders.Remove("X-Test-User");
            client.DefaultRequestHeaders.Add("X-Test-User", "admin");
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(route)).StatusCode);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    private sealed class NoopDeletionQueue : IRecipeImageDeletionQueue
    {
        public Task EnqueueAsync(Guid imageId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class NoopProcessingQueue : IRecipeImageProcessingQueue
    {
        public Task EnqueueAsync(Guid imageId, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var id = Request.Headers["X-Test-User"].ToString();
            if (string.IsNullOrEmpty(id)) return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, id),
                new Claim(ClaimTypes.Role, id == "admin" ? "Admin" : "Author")], Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
