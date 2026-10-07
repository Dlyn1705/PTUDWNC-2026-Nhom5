using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddCategoryActiveUniqueIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Categories_Slug",
                table: "Categories");

            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM "Categories"
                        WHERE "IsDeleted" = false
                        GROUP BY "Name"
                        HAVING COUNT(*) > 1
                    ) THEN
                        RAISE EXCEPTION 'Cannot create UX_Categories_Name_Active because active category names are duplicated.';
                    END IF;
                END $$;
                """);

            migrationBuilder.CreateIndex(
                name: "UX_Categories_Name_Active",
                table: "Categories",
                column: "Name",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "UX_Categories_Slug_Active",
                table: "Categories",
                column: "Slug",
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_Categories_Name_Active",
                table: "Categories");

            migrationBuilder.DropIndex(
                name: "UX_Categories_Slug_Active",
                table: "Categories");

            migrationBuilder.CreateIndex(
                name: "IX_Categories_Slug",
                table: "Categories",
                column: "Slug",
                unique: true);
        }
    }
}
