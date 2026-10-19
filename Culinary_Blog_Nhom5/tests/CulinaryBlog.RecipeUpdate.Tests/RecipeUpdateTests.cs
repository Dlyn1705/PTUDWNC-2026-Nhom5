using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Nodes;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipe;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Xunit;

namespace CulinaryBlog.RecipeUpdate.Tests;

public sealed class RecipeUpdateTests
{
    private static UpdateRecipeCommand Valid() => new(Guid.NewGuid(), "Phở bò", null, null,
        0, 0, 1, RecipeDifficulty.Easy, Guid.NewGuid(), "AQ==");

    [Theory]
    [InlineData(null, null)][InlineData("", "*")][InlineData("!", null)]
    [InlineData(null, "W/\"AQ==\"")][InlineData(null, "AQ==")]
    [InlineData(null, "\"AQ==\",\"Ag==\"")][InlineData("AQ==", "\"Ag==\"")]
    [InlineData(null, "\"\"")]
    public void Invalid_versions_are_rejected(string? body, string? header) =>
        Assert.Throws<ValidationException>(() => RecipeUpdateVersion.Parse(body, header));

    [Theory]
    [InlineData("AQ==", null)][InlineData(null, "\"AQ==\"")][InlineData("AQ==", "\"AQ==\"")]
    public void Body_or_strong_etag_is_accepted(string? body, string? header) =>
        Assert.Equal(new byte[] { 1 }, RecipeUpdateVersion.Parse(body, header));

    [Theory]
    [InlineData("title")][InlineData("description")][InlineData("instructions")]
    [InlineData("difficulty")][InlineData("category")][InlineData("prep")][InlineData("servings")]
    public void Invalid_fields_are_rejected(string field)
    {
        var command = field switch
        {
            "title" => Valid() with { Title = "ab" },
            "description" => Valid() with { Description = new string('a', 2001) },
            "instructions" => Valid() with { Instructions = new string('a', 10001) },
            "difficulty" => Valid() with { Difficulty = (RecipeDifficulty)99 },
            "category" => Valid() with { CategoryId = Guid.Empty },
            "prep" => Valid() with { PrepTime = -1 },
            _ => Valid() with { Servings = 0 }
        };
        Assert.False(new UpdateRecipeCommandValidator().Validate(command).IsValid);
    }

    [Fact]
    public async Task Application_enforces_roles_and_ownership_without_endpoint()
    {
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            new UpdateRecipeCommandHandler(new User(false, "owner", []), null!).Handle(Valid(), default));
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new UpdateRecipeCommandHandler(new User(true, "owner", ["Member"]), null!).Handle(Valid(), default));
        var store = new MemoryStore { Recipe = Recipe.Create("Original", "original", "", "", 0, 0, 1,
            RecipeDifficulty.Easy, Guid.NewGuid(), "owner") };
        await Assert.ThrowsAsync<ForbiddenException>(() => new UpdateRecipeCommandHandler(
            new User(true, "other", ["Author"]), store).Handle(Valid() with { RowVersion = null }, default));
        Assert.False(store.Saved);
        await new UpdateRecipeCommandHandler(new User(true, "other", ["Admin"]), store).Handle(Valid(), default);
        Assert.True(store.Saved); Assert.Equal("owner", store.Recipe.AuthorId);
        Assert.Equal("original", store.Recipe.Slug);
        Assert.Null(store.Recipe.Instructions);
    }

    private sealed class User(bool authenticated, string id, IReadOnlyList<string> roles) : ICurrentUserService
    {
        public string? UserId => id;
        public string? Email => null;
        public IReadOnlyList<string> Roles => roles;
        public bool IsAuthenticated => authenticated;
        public bool IsAdmin => roles.Contains("Admin");
    }
    private sealed class MemoryStore : IRecipeUpdateStore
    {
        public Recipe Recipe { get; init; } = null!;
        public bool Saved { get; private set; }
        public Task<Recipe?> GetAsync(Guid id, CancellationToken ct) => Task.FromResult<Recipe?>(Recipe);
        public Task<UpdatedRecipe> SaveAsync(Recipe recipe, byte[] version, string actorId, CancellationToken ct)
        { Saved = true; return Task.FromResult(new UpdatedRecipe("OK", recipe.Id, recipe.Slug, "Ag==")); }
    }

    [Fact]
    public async Task Real_postgres_and_signed_jwt_cover_update_permissions_versions_and_transactions()
    {
        var connection = Environment.GetEnvironmentVariable("RECIPE_UPDATE_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set RECIPE_UPDATE_TEST_CONNECTION to a local PostgreSQL admin connection.");
        var admin = new NpgsqlConnectionStringBuilder(connection) { Database = "postgres" };
        Assert.Contains(admin.Host, new[] { "localhost", "127.0.0.1" });
        var database = "fr_rcp004_test_" + Guid.NewGuid().ToString("N");
        await using var control = new NpgsqlConnection(admin.ConnectionString);
        await control.OpenAsync();
        await new NpgsqlCommand($"CREATE DATABASE \"{database}\"", control).ExecuteNonQueryAsync();
        WebApplication? app = null;
        try
        {
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = new NpgsqlConnectionStringBuilder(admin.ConnectionString) { Database = database }.ConnectionString,
                ["Minio:AccessKey"] = "test-access", ["Minio:SecretKey"] = "test-secret"
            });
            builder.Services.AddApplication(); builder.Services.AddInfrastructure(builder.Configuration);
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("recipe-update-tests-only-signing-key-123456789"));
            builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
                options.TokenValidationParameters = new TokenValidationParameters
                { ValidateIssuer = false, ValidateAudience = false, IssuerSigningKey = key });
            app = builder.Build();
            app.UseMiddleware<GlobalExceptionMiddleware>(); app.UseAuthentication(); app.UseAuthorization();
            app.MapGroup("/api/v1").MapRecipeEndpoints(); await app.StartAsync();
            var owner = ApplicationUser.Create("owner@test.invalid", "owner", "Owner");
            var other = ApplicationUser.Create("other@test.invalid", "other", "Other");
            var category = Category.Create("Category", "category");
            var destination = Category.Create("Destination", "destination");
            var deletedCategory = Category.Create("Deleted", "deleted"); deletedCategory.IsDeleted = true;
            var recipe = Recipe.Create("Original", "original", "Description", "Legacy", 1, 2, 3,
                RecipeDifficulty.Easy, category.Id, owner.Id);
            recipe.Steps.Add(RecipeStep.Create(recipe.Id, 1, "Bước 1", "Nấu", 5));
            recipe.Ingredients.Add(RecipeIngredient.Create(recipe.Id, "Muối", null, null, "Vừa đủ", 0));
            recipe.SetNutrition(1, 2, 3, 4, 5, 6); recipe.Publish();
            await using (var scope = app.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Database.MigrateAsync();
                db.AddRange(owner, other, category, destination, deletedCategory, recipe); await db.SaveChangesAsync();
            }
            using var client = app.GetTestClient();
            void Login(string userId, string role) => client.DefaultRequestHeaders.Authorization = new("Bearer",
                new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
                    claims: [new Claim(ClaimTypes.NameIdentifier, userId), new Claim(ClaimTypes.Role, role)],
                    expires: DateTime.UtcNow.AddMinutes(5), signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256))));
            JsonObject Payload(string? version) => new()
            {
                ["title"] = " Updated title ", ["description"] = " Updated description ", ["instructions"] = " Instructions ",
                ["prepTime"] = 0, ["cookTime"] = 0, ["servings"] = 1, ["difficulty"] = 4,
                ["categoryId"] = destination.Id, ["rowVersion"] = version,
                ["authorId"] = other.Id, ["status"] = 0, ["slug"] = "spoofed",
                ["steps"] = new JsonArray(), ["ingredients"] = new JsonArray(), ["nutrition"] = new JsonObject { ["calories"] = 999 }
            };
            var url = $"/api/v1/recipes/{recipe.Id}";
            var detailUrl = $"/api/v1/recipes/by-id/{recipe.Id}";
            async Task<HttpResponseMessage> Put(JsonObject payload, string? etag = null)
            {
                using var request = new HttpRequestMessage(HttpMethod.Put, url) { Content = JsonContent.Create(payload) };
                if (etag is not null) request.Headers.TryAddWithoutValidation("If-Match", etag);
                return await client.SendAsync(request);
            }
            var originalVersion = Convert.ToBase64String(recipe.RowVersion);
            Assert.Equal(HttpStatusCode.Unauthorized, (await Put(Payload(originalVersion))).StatusCode);
            Login(owner.Id, "Member"); Assert.Equal(HttpStatusCode.Forbidden, (await Put(Payload(originalVersion))).StatusCode);
            Login(other.Id, "Author"); Assert.Equal(HttpStatusCode.Forbidden, (await Put(Payload(null))).StatusCode);
            Login(owner.Id, "Author");
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Put(Payload(null))).StatusCode);
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Put(Payload(originalVersion), "\"AQ==\"")).StatusCode);
            var response = await Put(Payload(null), $"\"{originalVersion}\"");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var saved = (await response.Content.ReadFromJsonAsync<ApiResponse<UpdatedRecipe>>())!.Data!;
            Assert.NotEqual(originalVersion, saved.RowVersion); Assert.Equal("original", saved.Slug);
            Assert.Equal(saved.RowVersion, response.Headers.ETag!.Tag.Trim('"'));
            Assert.True(response.Headers.CacheControl!.NoStore);
            var refreshed = await client.GetAsync(detailUrl);
            Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
            Assert.True(refreshed.Headers.CacheControl!.NoStore);
            var refreshedBody = (await refreshed.Content.ReadFromJsonAsync<JsonObject>())!;
            Assert.Equal("Updated title", refreshedBody["data"]!["title"]!.GetValue<string>());
            Assert.Equal(HttpStatusCode.Conflict, (await Put(Payload(originalVersion))).StatusCode);
            foreach (var invalid in new[] { Payload(saved.RowVersion), Payload(saved.RowVersion), Payload(saved.RowVersion) }.Select((x, i) =>
            { if (i == 0) x["difficulty"] = 99; if (i == 1) x["servings"] = 0; if (i == 2) x["title"] = new string('a', 201); return x; }))
                Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Put(invalid)).StatusCode);
            var invalidCategory = Payload(saved.RowVersion); invalidCategory["categoryId"] = Guid.NewGuid();
            Assert.Equal(HttpStatusCode.NotFound, (await Put(invalidCategory)).StatusCode);
            invalidCategory["categoryId"] = deletedCategory.Id;
            Assert.Equal(HttpStatusCode.NotFound, (await Put(invalidCategory)).StatusCode);
            Login(other.Id, "Admin");
            var parallel = await Task.WhenAll(Put(Payload(saved.RowVersion)), Put(Payload(saved.RowVersion)));
            Assert.Single(parallel, x => x.StatusCode == HttpStatusCode.OK);
            Assert.Single(parallel, x => x.StatusCode == HttpStatusCode.Conflict);
            saved = (await parallel.Single(x => x.StatusCode == HttpStatusCode.OK).Content.ReadFromJsonAsync<ApiResponse<UpdatedRecipe>>())!.Data!;
            await using (var scope = app.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var stored = await db.Recipes.Include(x => x.Steps).Include(x => x.Ingredients).SingleAsync(x => x.Id == recipe.Id);
                Assert.Equal("Updated title", stored.Title); Assert.Equal("Updated description", stored.Description);
                Assert.Equal("Instructions", stored.Instructions); Assert.Equal(owner.Id, stored.AuthorId);
                Assert.Equal(RecipeStatus.Published, stored.Status);
                Assert.InRange(Math.Abs((recipe.PublishedAt!.Value - stored.PublishedAt!.Value).Ticks), 0, 10);
                Assert.Equal(1, stored.Nutrition.Calories); Assert.Single(stored.Steps); Assert.Single(stored.Ingredients);
                Assert.Equal("Vừa đủ", stored.Ingredients.Single().Notes); Assert.Equal(destination.Id, stored.CategoryId);
                var before = saved.RowVersion;
                await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_test_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_test_update BEFORE UPDATE ON \"Recipes\" FOR EACH ROW EXECUTE FUNCTION reject_test_update();");
                Assert.Equal(HttpStatusCode.InternalServerError, (await Put(Payload(before))).StatusCode);
                var unchanged = await db.Recipes.AsNoTracking().SingleAsync(x => x.Id == recipe.Id);
                Assert.Equal(before, Convert.ToBase64String(unchanged.RowVersion));
                await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_test_update ON \"Recipes\"; DROP FUNCTION reject_test_update();");
                await db.Database.ExecuteSqlRawAsync("CREATE SEQUENCE update_retry_once; CREATE FUNCTION retry_test_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('update_retry_once') = 1 THEN RAISE EXCEPTION 'retry once' USING ERRCODE = '40001'; END IF; RETURN NEW; END $$; CREATE TRIGGER retry_test_update BEFORE UPDATE ON \"Recipes\" FOR EACH ROW EXECUTE FUNCTION retry_test_update();");
                Assert.Equal(HttpStatusCode.OK, (await Put(Payload(before))).StatusCode);
                await db.Database.ExecuteSqlRawAsync("DROP TRIGGER retry_test_update ON \"Recipes\"; DROP FUNCTION retry_test_update(); DROP SEQUENCE update_retry_once;");
                // Refresh the tracking snapshot changed by other request scopes.
                await db.Entry(stored).ReloadAsync(); stored.Status = RecipeStatus.Archived; await db.SaveChangesAsync();
                var archivedVersion = Convert.ToBase64String(stored.RowVersion);
                Assert.Equal(HttpStatusCode.OK, (await Put(Payload(archivedVersion))).StatusCode);
                await db.Entry(stored).ReloadAsync(); Assert.Equal(RecipeStatus.Archived, stored.Status);
                stored.Status = RecipeStatus.Draft; await db.SaveChangesAsync();
                Assert.Equal(HttpStatusCode.OK, (await Put(Payload(Convert.ToBase64String(stored.RowVersion)))).StatusCode);
                await db.Entry(stored).ReloadAsync(); Assert.Equal(RecipeStatus.Draft, stored.Status);
                other.IsActive = false; db.Update(other); await db.SaveChangesAsync();
                Assert.Equal(HttpStatusCode.Forbidden, (await Put(Payload(Convert.ToBase64String(stored.RowVersion)))).StatusCode);
                other.IsActive = true; await db.SaveChangesAsync();
                stored.SoftDelete(); await db.SaveChangesAsync();
                Assert.Equal(HttpStatusCode.NotFound, (await Put(Payload(Convert.ToBase64String(stored.RowVersion)))).StatusCode);
            }
        }
        finally
        {
            if (app is not null) await app.DisposeAsync();
            NpgsqlConnection.ClearAllPools();
            await new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", control).ExecuteNonQueryAsync();
        }
    }
}
