using System.Data.Common;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Repositories;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

var connection = Environment.GetEnvironmentVariable("PERF_DB") ?? throw new Exception("PERF_DB required");
var cs = new NpgsqlConnectionStringBuilder(connection);
if (cs.Database is null || !cs.Database.StartsWith("issue85_", StringComparison.Ordinal))
    throw new Exception("Only isolated issue85_* databases are accepted");
var output = Path.GetFullPath(Environment.GetEnvironmentVariable("PERF_OUTPUT") ?? "build/issue85");
Directory.CreateDirectory(output);
var capture = new SqlCapture();
var services = new ServiceCollection().AddLogging();
services.AddDbContext<ApplicationDbContext>(o => o.UseNpgsql(connection).AddInterceptors(capture));
services.AddIdentityCore<ApplicationUser>().AddRoles<IdentityRole>().AddEntityFrameworkStores<ApplicationDbContext>();
await using var provider = services.BuildServiceProvider();
await using var scope = provider.CreateAsyncScope();
var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
var mode = args.FirstOrDefault() ?? "seed";
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true };
Guid Stable(string key) => new(SHA256.HashData(Encoding.UTF8.GetBytes("issue85:" + key))[..16]);
var categoryIds = Enumerable.Range(0, 10).Select(i => Stable("category" + i)).ToArray();
if (mode == "seed")
{
    var password = Environment.GetEnvironmentVariable("PERF_PASSWORD") ?? throw new Exception("PERF_PASSWORD required");
    var count = int.Parse(Environment.GetEnvironmentVariable("PERF_RECIPES") ?? "5000");
    if (count < 100 || count > 50000) throw new Exception("PERF_RECIPES must be 100..50000");
    await db.Database.MigrateAsync();
    var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
    foreach (var role in new[] { "Author", "Admin" })
        if (!await roles.RoleExistsAsync(role)) Ensure(await roles.CreateAsync(new IdentityRole(role)));
    for (int i = 0; i < 4; i++)
    {
        var email = $"perf{i}@issue85.local";
        var user = await users.FindByEmailAsync(email);
        if (user is null)
        {
            user = ApplicationUser.Create(email, email, "Performance author " + i);
            user.Id = Stable("author" + i).ToString(); user.EmailConfirmed = true;
            Ensure(await users.CreateAsync(user, password));
            Ensure(await users.AddToRoleAsync(user, "Author"));
        }
        else if (!await users.CheckPasswordAsync(user, password)) throw new Exception("Existing seed password differs");
    }
    for (int i = 0; i < 10; i++)
        if (!await db.Categories.AnyAsync(c => c.Id == categoryIds[i]))
        {
            var category = Category.Create("Issue85 category " + i, "issue85-category-" + i);
            category.Id = categoryIds[i]; category.RowVersion = Stable("cv" + i).ToByteArray();
            db.Categories.Add(category);
        }
    await db.SaveChangesAsync();
    if (!await db.Recipes.IgnoreQueryFilters().AnyAsync())
    {
        for (int i = 0; i < count; i++)
        {
            var recipe = Recipe.Create("Phở gà performance " + i, "issue85-recipe-" + i,
                "Công thức phở gà Việt Nam dùng để kiểm thử", null, 5 + i % 30, 10 + i % 90,
                1 + i % 6, (RecipeDifficulty)(1 + i % 4), categoryIds[i % 10], Stable("author" + i % 4).ToString());
            recipe.Id = Stable("recipe" + i); recipe.RowVersion = Stable("rv" + i).ToByteArray();
            recipe.CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMinutes(i);
            recipe.Status = i % 20 < 16 ? RecipeStatus.Published : i % 20 < 18 ? RecipeStatus.Draft : RecipeStatus.Archived;
            recipe.IsDeleted = i % 20 == 19;
            recipe.PublishedAt = recipe.Status == RecipeStatus.Published ? recipe.CreatedAt : null;
            for (int j = 0; j < 1 + i % 8; j++)
            {
                recipe.Steps.Add(RecipeStep.Create(recipe.Id, j + 1, "Bước " + (j + 1), "Nấu phở gà và kiểm tra nguyên liệu"));
                recipe.Ingredients.Add(RecipeIngredient.Create(recipe.Id, "Gà " + j, 1, "g", null, j));
            }
            db.Recipes.Add(recipe);
            if (i % 250 == 249) { await db.SaveChangesAsync(); db.ChangeTracker.Clear(); }
        }
        await db.SaveChangesAsync();
    }
    var actual = await db.Recipes.IgnoreQueryFilters().CountAsync();
    if (actual != count) throw new Exception("Dataset size differs; use a fresh isolated database");
    await SeedImages();
    await db.Database.ExecuteSqlRawAsync("ANALYZE");
    await File.WriteAllTextAsync(Path.Combine(output, "fixtures.json"), JsonSerializer.Serialize(new {
        seed = 85, count, categories = categoryIds.Select((id, i) => new { id, slug = "issue85-category-" + i }),
        slugs = Enumerable.Range(0, Math.Min(count, 200)).Where(i => i % 20 < 16).Select(i => "issue85-recipe-" + i),
        emails = Enumerable.Range(0, 4).Select(i => $"perf{i}@issue85.local")
    }, json));
    Console.WriteLine($"Seeded {actual} recipes; fixtures contain no credentials.");
}
else if (mode == "verify")
{
    var activeFixtureWork = await db.RecipeImageWork.CountAsync(w => w.Status != "Skipped" &&
        db.RecipeImages.IgnoreQueryFilters().Any(i => i.Id == w.ImageId && i.OriginalUrl == "/issue85.svg"));
    if (activeFixtureWork != 0) throw new Exception("Synthetic image work must be Skipped before measurement");
    async Task<long> Epoch() => await db.Database.SqlQueryRaw<long>("SELECT generation AS \"Value\" FROM public.cache_epoch WHERE id=1").SingleAsync();
    var before = await Epoch(); await Task.Delay(3000);
    if (before != await Epoch()) throw new Exception("Dataset is mutating before measurement; resolve writers/jobs first");
    var fixtureImages = await db.RecipeImages.IgnoreQueryFilters().CountAsync(i => i.OriginalUrl == "/issue85.svg");
    if (fixtureImages == 0) throw new Exception("Seed images before measurement");
    await File.WriteAllTextAsync(Path.Combine(output, "fixture-verification.json"), JsonSerializer.Serialize(new {
        verifiedUtc = DateTime.UtcNow, epoch = before, activeFixtureWork, fixtureImages,
        actualRecipeRows = await db.Recipes.IgnoreQueryFilters().CountAsync(),
        publishedRecipes = await db.Recipes.CountAsync(r => r.Status == RecipeStatus.Published)
    }, json));
    Console.WriteLine("Synthetic image jobs are excluded and cache epoch is stable before measurement.");
}
else if (mode == "images") { await SeedImages(); await db.Database.ExecuteSqlRawAsync("ANALYZE"); }
else if (mode == "plans")
{
    var repo = new RecipeRepository(db); var categories = new CategoryRepository(db);
    var results = new List<object>();
    foreach (var size in new[] { 12, 50 })
        foreach (var kind in new[] { "list", "search", "category", "detail" })
        {
            capture.Commands.Clear(); db.ChangeTracker.Clear(); capture.Enabled = true;
            if (kind == "list") await repo.GetPagedAsync(1, size);
            if (kind == "search") await repo.SearchRecipesAsync("pho", 1, size);
            if (kind == "category") { await categories.GetBySlugAsync("issue85-category-0"); await repo.GetPagedAsync(1, size, categoryIds[0]); }
            if (kind == "detail") await repo.GetBySlugAsync("issue85-recipe-0");
            capture.Enabled = false;
            var plans = new List<object>();
            await using var sql = new NpgsqlConnection(connection); await sql.OpenAsync();
            foreach (var saved in capture.Commands)
            {
                await using var command = new NpgsqlCommand("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + saved.Sql, sql);
                command.Parameters.AddRange(saved.Parameters);
                var plan = (string)(await command.ExecuteScalarAsync())!;
                plans.Add(new { sql = saved.Sql, plan = JsonSerializer.Deserialize<JsonElement>(plan) });
            }
            results.Add(new { kind, pageSize = size, sqlCount = capture.Commands.Count, plans });
            var expected = kind == "detail" ? 1 : kind == "category" ? 3 : 2;
            if (capture.Commands.Count != expected) throw new Exception($"Unexpected SQL count for {kind}: {capture.Commands.Count}");
        }
    await File.WriteAllTextAsync(Path.Combine(output, "query-plans.json"), JsonSerializer.Serialize(results, json));
}
else throw new Exception("Usage: seed | images | verify | plans");
async Task SeedImages()
{
    var ids = await db.Recipes.IgnoreQueryFilters().Where(r => r.Slug.StartsWith("issue85-recipe-")).OrderBy(r => r.Id).Select(r => r.Id).ToListAsync();
    var existing = (await db.RecipeImages.IgnoreQueryFilters().Select(i => i.RecipeId).Distinct().ToListAsync()).ToHashSet();
    foreach (var batch in ids.Where(id => !existing.Contains(id)).Chunk(250))
    {
        foreach (var id in batch)
            for (int index = 0; index < 1 + id.ToByteArray()[0] % 3; index++)
            {
                var image = RecipeImage.Create(id, "/issue85.svg", "Deterministic local performance fixture", index == 0, index);
                image.Id = Stable("image" + id + index); image.RowVersion = image.Id.ToByteArray();
                image.MediumUrl = image.OriginalUrl; image.ThumbnailUrl = image.OriginalUrl; image.ProcessingStatus = "Completed";
                db.RecipeImages.Add(image);
            }
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
    }
    // INSERT trigger creates Pending work even for synthetic Completed images. These
    // local SVGs are not MinIO originals; exclude only fixture work from real workers.
    await db.RecipeImageWork.Where(w => db.RecipeImages.IgnoreQueryFilters().Any(i => i.Id == w.ImageId && i.OriginalUrl == "/issue85.svg"))
        .ExecuteUpdateAsync(set => set.SetProperty(w => w.Status, "Skipped").SetProperty(w => w.LastErrorCode, "PerformanceFixture"));
    await db.RecipeImages.IgnoreQueryFilters().Where(i => i.OriginalUrl == "/issue85.svg" && i.ProcessingStatus != "Completed")
        .ExecuteUpdateAsync(set => set.SetProperty(i => i.ProcessingStatus, "Completed")
            .SetProperty(i => i.MediumUrl, i => i.OriginalUrl).SetProperty(i => i.ThumbnailUrl, i => i.OriginalUrl));
}
static void Ensure(IdentityResult result) { if (!result.Succeeded) throw new Exception(string.Join(";", result.Errors.Select(e => e.Description))); }

sealed class SqlCapture : DbCommandInterceptor
{
    public bool Enabled;
    public List<(string Sql, NpgsqlParameter[] Parameters)> Commands { get; } = [];
    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
        CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
    {
        if (Enabled) Commands.Add((command.CommandText, command.Parameters.Cast<NpgsqlParameter>().Select(p => p.Clone()).ToArray()));
        return ValueTask.FromResult(result);
    }
}
