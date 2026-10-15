using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CulinaryBlog.Infrastructure.Persistence.Migrations;

/// <summary>Data-only repair: the existing partial unique indexes remain unchanged.</summary>
[DbContext(typeof(ApplicationDbContext))]
[Migration("20261015000000_RepairMissingRecipeImagePrimary")]
public sealed class RepairMissingRecipeImagePrimary : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        WITH first_image AS (
            SELECT DISTINCT ON (i."RecipeId") i."Id"
            FROM "RecipeImages" i
            JOIN "Recipes" r ON r."Id" = i."RecipeId"
            WHERE NOT i."IsDeleted" AND NOT r."IsDeleted"
              AND NOT EXISTS (
                  SELECT 1 FROM "RecipeImages" p
                  WHERE p."RecipeId" = i."RecipeId" AND p."IsPrimary" AND NOT p."IsDeleted")
            ORDER BY i."RecipeId", i."OrderIndex", i."CreatedAt", i."Id"
        )
        UPDATE "RecipeImages" i SET "IsPrimary" = TRUE, "UpdatedAt" = CURRENT_TIMESTAMP
        FROM first_image f WHERE i."Id" = f."Id";
        """);

    // Undoing this repair would intentionally reintroduce an invalid gallery.
    protected override void Down(MigrationBuilder migrationBuilder) { }
}
