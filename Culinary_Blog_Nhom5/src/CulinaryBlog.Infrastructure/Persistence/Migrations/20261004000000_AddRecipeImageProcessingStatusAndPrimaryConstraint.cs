using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations;

[DbContext(typeof(CulinaryBlog.Infrastructure.Persistence.ApplicationDbContext))]
[Migration("20261004000000_AddRecipeImageProcessingStatusAndPrimaryConstraint")]
public partial class AddRecipeImageProcessingStatusAndPrimaryConstraint : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "ProcessingStatus", table: "RecipeImages", type: "character varying(20)", maxLength: 20,
            nullable: false, defaultValue: "Pending");

        migrationBuilder.Sql("UPDATE \"RecipeImages\" SET \"ProcessingStatus\" = 'Completed' WHERE \"MediumUrl\" IS NOT NULL AND \"ThumbnailUrl\" IS NOT NULL;");

        migrationBuilder.Sql("WITH ranked AS (SELECT \"Id\", ROW_NUMBER() OVER (PARTITION BY \"RecipeId\" ORDER BY \"CreatedAt\", \"Id\") AS rn FROM \"RecipeImages\" WHERE \"IsPrimary\" = TRUE AND \"IsDeleted\" = FALSE) UPDATE \"RecipeImages\" AS i SET \"IsPrimary\" = FALSE FROM ranked r WHERE i.\"Id\" = r.\"Id\" AND r.rn > 1;");

        migrationBuilder.DropIndex(name: "IX_RecipeImages_RecipeId", table: "RecipeImages");

        migrationBuilder.Sql("WITH ranked AS (SELECT \"Id\", ROW_NUMBER() OVER (PARTITION BY \"RecipeId\" ORDER BY \"OrderIndex\", \"CreatedAt\", \"Id\") - 1 AS next_order FROM \"RecipeImages\" WHERE \"IsDeleted\" = FALSE) UPDATE \"RecipeImages\" AS i SET \"OrderIndex\" = r.next_order FROM ranked r WHERE i.\"Id\" = r.\"Id\";");

        migrationBuilder.CreateIndex(
            name: "IX_RecipeImages_RecipeId", table: "RecipeImages", column: "RecipeId",
            unique: true, filter: "\"IsPrimary\" = TRUE AND \"IsDeleted\" = FALSE");

        migrationBuilder.CreateIndex(
            name: "IX_RecipeImages_RecipeId_OrderIndex", table: "RecipeImages", columns: new[] { "RecipeId", "OrderIndex" },
            unique: true, filter: "\"IsDeleted\" = FALSE");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_RecipeImages_RecipeId", table: "RecipeImages");
        migrationBuilder.DropIndex(name: "IX_RecipeImages_RecipeId_OrderIndex", table: "RecipeImages");
        migrationBuilder.CreateIndex(name: "IX_RecipeImages_RecipeId", table: "RecipeImages", column: "RecipeId");
        migrationBuilder.DropColumn(name: "ProcessingStatus", table: "RecipeImages");
    }
}
