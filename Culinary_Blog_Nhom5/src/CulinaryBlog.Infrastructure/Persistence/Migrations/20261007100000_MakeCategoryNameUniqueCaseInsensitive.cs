using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations;

/// <summary>
/// Aligns PostgreSQL uniqueness with the application rule that category names
/// are compared case-insensitively.
/// </summary>
public partial class MakeCategoryNameUniqueCaseInsensitive : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "UX_Categories_Name_Active",
            table: "Categories");

        migrationBuilder.Sql(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM "Categories"
                    WHERE "IsDeleted" = false
                    GROUP BY lower(trim("Name"))
                    HAVING COUNT(*) > 1
                ) THEN
                    RAISE EXCEPTION 'Cannot create UX_Categories_Name_Active because active category names are duplicated case-insensitively.';
                END IF;
            END $$;
            """);

        migrationBuilder.Sql(
            """
            CREATE UNIQUE INDEX "UX_Categories_Name_Active"
            ON "Categories" (lower(trim("Name")))
            WHERE "IsDeleted" = false;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            @"DROP INDEX IF EXISTS ""UX_Categories_Name_Active"";");

        migrationBuilder.CreateIndex(
            name: "UX_Categories_Name_Active",
            table: "Categories",
            column: "Name",
            unique: true,
            filter: "\"IsDeleted\" = false");
    }
}
