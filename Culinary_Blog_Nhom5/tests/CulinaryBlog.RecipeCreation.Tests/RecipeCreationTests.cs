using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Nodes;
using CulinaryBlog.API.Endpoints;
using CulinaryBlog.API.Middlewares;
using CulinaryBlog.Application;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Commands.CreateRecipe;
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

namespace CulinaryBlog.RecipeCreation.Tests;

public class RecipeCreationTests
{
    private static CreateRecipeCommand Valid() => new("Đậu đỏ", null, null, 0, 0, 1,
        RecipeDifficulty.Easy, Guid.NewGuid());

    private static async Task<CreatedRecipe> ReadCreated(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        var envelope = await response.Content.ReadFromJsonAsync<ApiResponse<CreatedRecipe>>();
        return envelope?.Data ?? throw new InvalidOperationException("Create response did not contain data.");
    }

    [Theory]
    [InlineData("title")][InlineData("difficulty")][InlineData("quantity")]
    [InlineData("precision")][InlineData("nutrition")][InlineData("nullIngredient")]
    [InlineData("nullStep")][InlineData("stepTitle")][InlineData("timer")]
    public void Rejects_invalid_nested_data(string field)
    {
        var command = field switch
        {
            "title" => Valid() with { Title = "  " },
            "difficulty" => Valid() with { Difficulty = (RecipeDifficulty)99 },
            "quantity" => Valid() with { Ingredients = [new("Muối", 0, null, null)] },
            "precision" => Valid() with { Ingredients = [new("Muối", 1.0001m, null, null)] },
            "nutrition" => Valid() with { Nutrition = new(1000000, null, null, null, null, null) },
            "nullIngredient" => Valid() with { Ingredients = [null] },
            "nullStep" => Valid() with { Steps = [null] },
            "stepTitle" => Valid() with { Steps = [new("Nấu", new string('a', 201), null)] },
            _ => Valid() with { Steps = [new("Nấu", null, -1)] }
        };
        Assert.False(new CreateRecipeCommandValidator().Validate(command).IsValid);
    }

    [Fact]
    public void Draft_accepts_empty_children_and_nullable_quantities()
    {
        Assert.True(new CreateRecipeCommandValidator().Validate(Valid()).IsValid);
        Assert.True(new CreateRecipeCommandValidator().Validate(Valid() with
        { Ingredients = [new("Muối", null, null, null)], Steps = [new("Nấu", null, 0)] }).IsValid);
    }

    [Fact]
    public async Task Application_handler_enforces_authorization_without_http()
    {
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            new CreateRecipeCommandHandler(new User(false, []), null!).Handle(Valid(), default));
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            new CreateRecipeCommandHandler(new User(true, ["Member"]), null!).Handle(Valid(), default));
    }

    private sealed class User(bool authenticated, IReadOnlyList<string> roles) : ICurrentUserService
    {
        public string? UserId => "test-user";
        public string? Email => null;
        public IReadOnlyList<string> Roles => roles;
        public bool IsAuthenticated => authenticated;
        public bool IsAdmin => roles.Contains("Admin");
    }

    [Fact]
    public async Task PostgreSql_http_authorization_atomicity_and_concurrent_slugs()
    {
        var connection = Environment.GetEnvironmentVariable("RECIPE_CREATE_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set RECIPE_CREATE_TEST_CONNECTION to a local PostgreSQL admin connection.");
        var admin = new NpgsqlConnectionStringBuilder(connection) { Database = "postgres" };
        Assert.Contains(admin.Host, new[] { "localhost", "127.0.0.1" });
        var database = "fr_rcp003_test_" + Guid.NewGuid().ToString("N");
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
            builder.Services.AddApplication();
            builder.Services.AddInfrastructure(builder.Configuration);
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("recipe-creation-tests-only-signing-key-123456789"));
            builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
                o.TokenValidationParameters = new TokenValidationParameters
                { ValidateIssuer = false, ValidateAudience = false, IssuerSigningKey = key });
            app = builder.Build();
            app.UseMiddleware<GlobalExceptionMiddleware>();
            app.UseAuthentication(); app.UseAuthorization();
            app.MapGroup("/api/v1").MapRecipeEndpoints();
            await app.StartAsync();
            var category = Category.Create("Món chính", "mon-chinh");
            var user = ApplicationUser.Create("author@test.invalid", "author", "Author");
            await using (var scope = app.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await db.Database.MigrateAsync();
                db.AddRange(category, user); await db.SaveChangesAsync();
            }
            using var client = app.GetTestClient();
            string Token(string role) => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
                claims: [new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim(ClaimTypes.Role, role)],
                expires: DateTime.UtcNow.AddMinutes(5), signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256)));
            JsonObject Payload(string title = "Đậu đỏ") => new()
            {
                ["title"] = title, ["categoryId"] = category.Id, ["difficulty"] = 1,
                ["prepTime"] = 0, ["cookTime"] = 0, ["servings"] = 1,
                ["authorId"] = "spoofed", ["status"] = 1, ["slug"] = "spoofed"
            };
            async Task<HttpResponseMessage> Post(JsonObject payload) => await client.PostAsJsonAsync("/api/v1/recipes", payload);
            Assert.Equal(HttpStatusCode.Unauthorized, (await Post(Payload())).StatusCode);
            client.DefaultRequestHeaders.Authorization = new("Bearer", Token("Member"));
            Assert.Equal(HttpStatusCode.Forbidden, (await Post(Payload())).StatusCode);
            client.DefaultRequestHeaders.Authorization = new("Bearer", Token("Author"));
            var createdResponse = await Post(Payload());
            Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
            var created = await ReadCreated(createdResponse);
            Assert.Equal("dau-do", created.Slug);
            Assert.NotEmpty(Convert.FromBase64String(created.RowVersion));
            Assert.EndsWith(created.Slug, createdResponse.Headers.Location!.ToString());
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/recipes/{created.Slug}")).StatusCode);
            client.DefaultRequestHeaders.Authorization = null;
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/recipes/{created.Slug}")).StatusCode);
            client.DefaultRequestHeaders.Authorization = new("Bearer", Token("Author"));
            var concurrent = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => Post(Payload())));
            Assert.All(concurrent, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));
            var results = await Task.WhenAll(concurrent.Select(ReadCreated));
            Assert.Equal(5, results.Select(r => r!.Slug).Distinct().Count());
            Assert.Contains(results, r => r!.Slug == "dau-do-6");
            var invalid = Payload(); invalid["difficulty"] = 99;
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post(invalid)).StatusCode);
            invalid = Payload(); invalid["ingredients"] = new JsonArray((JsonNode?)null);
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post(invalid)).StatusCode);
            invalid = Payload(); invalid["categoryId"] = Guid.NewGuid();
            Assert.Equal(HttpStatusCode.NotFound, (await Post(invalid)).StatusCode);
            invalid = Payload(); invalid["ingredients"] = new JsonArray(new JsonObject { ["name"] = "Muối", ["quantity"] = 0 });
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Post(invalid)).StatusCode);
            var longTitle = new string('a', 200);
            var longOne = await ReadCreated(await Post(Payload(longTitle)));
            var longTwo = await ReadCreated(await Post(Payload(longTitle)));
            Assert.Equal(longTitle, longOne.Slug); Assert.Equal(longTitle + "-2", longTwo.Slug);
            var symbol = await ReadCreated(await Post(Payload("🍲🍲🍲")));
            Assert.StartsWith("recipe-", symbol.Slug);
            var full = Payload("Món đầy đủ");
            full["ingredients"] = new JsonArray(new JsonObject { ["name"] = " Muối ", ["quantity"] = null });
            full["steps"] = new JsonArray(new JsonObject { ["description"] = " Nấu chín ", ["timerMinutes"] = 0 });
            full["nutrition"] = new JsonObject { ["calories"] = 12.34m };
            client.DefaultRequestHeaders.Authorization = new("Bearer", Token("Admin"));
            Assert.Equal(HttpStatusCode.Created, (await Post(full)).StatusCode);
            await using (var scope = app.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var draft = await db.Recipes.SingleAsync(x => x.Id == created.Id);
                Assert.Equal(user.Id, draft.AuthorId); Assert.Equal(RecipeStatus.Draft, draft.Status);
                Assert.Null(draft.PublishedAt); Assert.Null(draft.Instructions);
                var complete = await db.Recipes.Include(x => x.Ingredients).Include(x => x.Steps).SingleAsync(x => x.Slug == "mon-day-du");
                Assert.Equal("Muối", Assert.Single(complete.Ingredients).Name);
                Assert.Equal(0, Assert.Single(complete.Ingredients).OrderIndex);
                Assert.Equal("Bước 1", Assert.Single(complete.Steps).Title);
                Assert.Equal(1, complete.Steps.Single().StepNumber); Assert.Equal(12.34m, complete.Nutrition.Calories);
                draft.SoftDelete(); await db.SaveChangesAsync();
                Assert.Equal("dau-do", (await ReadCreated(await Post(Payload()))).Slug);
                // A child insert failure must roll back the root and every sibling in the same transaction.
                await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_test_step() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test child failure'; END $$; CREATE TRIGGER reject_test_step BEFORE INSERT ON \"RecipeSteps\" FOR EACH ROW EXECUTE FUNCTION reject_test_step();");
                full["title"] = "Rollback recipe";
                Assert.Equal(HttpStatusCode.InternalServerError, (await Post(full)).StatusCode);
                Assert.False(await db.Recipes.AnyAsync(x => x.Title == "Rollback recipe"));
                await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_test_step ON \"RecipeSteps\"; DROP FUNCTION reject_test_step();");
                // PostgreSQL sequences survive rollback: fail exactly once to exercise the real execution strategy.
                await db.Database.ExecuteSqlRawAsync("CREATE SEQUENCE create_retry_once; CREATE FUNCTION retry_test_step() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('create_retry_once') = 1 THEN RAISE EXCEPTION 'retry once' USING ERRCODE = '40001'; END IF; RETURN NEW; END $$; CREATE TRIGGER retry_test_step BEFORE INSERT ON \"RecipeSteps\" FOR EACH ROW EXECUTE FUNCTION retry_test_step();");
                full["title"] = "Retry recipe";
                Assert.Equal(HttpStatusCode.Created, (await Post(full)).StatusCode);
                Assert.Equal(1, await db.Recipes.CountAsync(x => x.Title == "Retry recipe"));
                await db.Database.ExecuteSqlRawAsync("DROP TRIGGER retry_test_step ON \"RecipeSteps\"; DROP FUNCTION retry_test_step(); DROP SEQUENCE create_retry_once;");
                category.IsDeleted = true; db.Update(category); await db.SaveChangesAsync();
                Assert.Equal(HttpStatusCode.NotFound, (await Post(Payload())).StatusCode);
                user.IsActive = false; db.Update(user); await db.SaveChangesAsync();
                Assert.Equal(HttpStatusCode.Forbidden, (await Post(Payload())).StatusCode);
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
