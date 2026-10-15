using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeImages;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Infrastructure.Persistence;
using CulinaryBlog.Infrastructure.Persistence.Interceptors;
using CulinaryBlog.Infrastructure.Repositories;
using CulinaryBlog.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace CulinaryBlog.RecipeImages.Tests;

public sealed class GalleryTests
{
    [Theory]
    [InlineData("owner", false, true)]
    [InlineData("other", false, false)]
    [InlineData(null, false, false)]
    [InlineData("admin", true, true)]
    public void Gallery_access_is_owner_or_admin(string? id, bool admin, bool allowed)
    {
        var error = Record.Exception(() => RecipeImageAccess.EnsureOwner(new Recipe { AuthorId = "owner" }, new User(id, admin)));
        if (allowed) Assert.Null(error);
        else Assert.IsType<ForbiddenException>(error);
    }

    [Fact]
    public async Task PostgreSql_gallery_serializes_mutations_and_preserves_primary()
    {
        // Explicit opt-in. Creates and removes a uniquely named test database, never the configured database.
        var configured = Environment.GetEnvironmentVariable("RECIPE_IMAGES_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set RECIPE_IMAGES_TEST_CONNECTION to run PostgreSQL integration tests.");
        var builder = new NpgsqlConnectionStringBuilder(configured) { Database = "fr_rcp008_test_" + Guid.NewGuid().ToString("N") };
        var services = new ServiceCollection();
        services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(builder.ConnectionString,
            npgsql => npgsql.EnableRetryOnFailure()).AddInterceptors(new AuditInterceptor()));
        await using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        try
        {
            await db.Database.EnsureCreatedAsync();
            var owner = new ApplicationUser { DisplayName = "Gallery test owner" };
            var category = Category.Create("Gallery test", "gallery-test");
            var recipe = Recipe.Create("Gallery", "gallery", "description", "instructions", 1, 1, 1,
                RecipeDifficulty.Easy, category.Id, owner.Id);
            db.AddRange(owner, category, recipe);
            await db.SaveChangesAsync();
            var user = new User(owner.Id, false);
            var mutations = new RecipeImageMutations(provider.GetRequiredService<IServiceScopeFactory>(), user);
            var first = RecipeImage.Create(recipe.Id, "https://example.test/first.jpg");
            var second = RecipeImage.Create(recipe.Id, "https://example.test/second.jpg");
            await Task.WhenAll(mutations.AddAsync(first, default), mutations.AddAsync(second, default));
            db.ChangeTracker.Clear();
            var active = await db.RecipeImages.OrderBy(x => x.OrderIndex).ToListAsync();
            Assert.Equal(new[] { 0, 1 }, active.Select(x => x.OrderIndex));
            Assert.Single(active, x => x.IsPrimary);
            Assert.True(active[0].IsPrimary);

            await Task.WhenAll(mutations.SetPrimaryAsync(recipe.Id, first.Id, default),
                mutations.SetPrimaryAsync(recipe.Id, second.Id, default));
            await mutations.SetPrimaryAsync(recipe.Id, second.Id, default);
            await mutations.SetPrimaryAsync(recipe.Id, second.Id, default);
            var gallery = new GetRecipeImagesQueryHandler(new RecipeRepository(db), user);
            db.ChangeTracker.Clear();
            var loaded = await gallery.Handle(new GetRecipeImagesQuery(recipe.Id), default);
            Assert.Equal(second.Id, Assert.Single(loaded, x => x.IsPrimary).Id);
            await Assert.ThrowsAsync<ForbiddenException>(() => new GetRecipeImagesQueryHandler(
                new RecipeRepository(db), new User("other", false)).Handle(new GetRecipeImagesQuery(recipe.Id), default));
            await Assert.ThrowsAsync<NotFoundException>(() => mutations.SetPrimaryAsync(Guid.NewGuid(), second.Id, default));
            await Assert.ThrowsAsync<NotFoundException>(() => mutations.SetPrimaryAsync(recipe.Id, Guid.NewGuid(), default));

            await mutations.DeleteAsync(recipe.Id, second.Id, default);
            await mutations.DeleteAsync(recipe.Id, second.Id, default);
            db.ChangeTracker.Clear();
            Assert.True((await db.RecipeImages.SingleAsync()).IsPrimary);
            Assert.Equal(2, await db.RecipeImages.IgnoreQueryFilters().CountAsync());
            var third = RecipeImage.Create(recipe.Id, "https://example.test/third.jpg");
            await Task.WhenAll(mutations.AddAsync(third, default), mutations.DeleteAsync(recipe.Id, first.Id, default));
            db.ChangeTracker.Clear();
            Assert.True((await db.RecipeImages.SingleAsync()).IsPrimary);
            await mutations.DeleteAsync(recipe.Id, third.Id, default);
            Assert.Empty(await db.RecipeImages.AsNoTracking().ToListAsync());

            // Existing data with no primary is repaired on the next gallery mutation.
            var legacy = RecipeImage.Create(recipe.Id, "https://example.test/legacy.jpg", orderIndex: 0);
            db.RecipeImages.Add(legacy);
            await db.SaveChangesAsync();
            var repair = new CulinaryBlog.Infrastructure.Persistence.Migrations.RepairMissingRecipeImagePrimary();
            var sql = Assert.IsType<Microsoft.EntityFrameworkCore.Migrations.Operations.SqlOperation>(Assert.Single(repair.UpOperations)).Sql;
            await db.Database.ExecuteSqlRawAsync(sql);
            db.ChangeTracker.Clear();
            Assert.Equal(legacy.Id, (await db.RecipeImages.SingleAsync(x => x.IsPrimary)).Id);
            var next = RecipeImage.Create(recipe.Id, "https://example.test/next.jpg");
            await mutations.AddAsync(next, default);
            db.ChangeTracker.Clear();
            Assert.Equal(legacy.Id, (await db.RecipeImages.SingleAsync(x => x.IsPrimary)).Id);

            var archived = await db.Recipes.SingleAsync();
            archived.Status = RecipeStatus.Archived;
            await db.SaveChangesAsync();
            await Assert.ThrowsAsync<ConflictException>(() => mutations.AddAsync(
                RecipeImage.Create(recipe.Id, "https://example.test/rejected.jpg"), default));
            await mutations.SetPrimaryAsync(recipe.Id, next.Id, default);
            db.ChangeTracker.Clear();
            var deleted = await db.Recipes.SingleAsync();
            deleted.SoftDelete();
            await db.SaveChangesAsync();
            await Assert.ThrowsAsync<NotFoundException>(() => mutations.SetPrimaryAsync(recipe.Id, next.Id, default));
            Assert.Equal(5, await db.RecipeImages.IgnoreQueryFilters().CountAsync());
        }
        finally
        {
            await db.Database.EnsureDeletedAsync();
        }
    }

    private sealed record User(string? UserId, bool IsAdmin) : ICurrentUserService
    {
        public string? Email => null;
        public IReadOnlyList<string> Roles => IsAdmin ? ["Admin"] : ["Author"];
        public bool IsAuthenticated => UserId is not null;
    }
}
