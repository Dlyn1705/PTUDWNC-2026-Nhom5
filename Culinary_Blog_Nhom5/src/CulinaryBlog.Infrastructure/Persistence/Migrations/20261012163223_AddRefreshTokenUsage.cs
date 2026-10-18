using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRefreshTokenUsage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsUsed",
                table: "RefreshTokens",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // A replacement proves prior consumption; revocation alone may simply be a logout.
            migrationBuilder.Sql("""
                UPDATE "RefreshTokens"
                SET "IsUsed" = true, "RevokedAt" = COALESCE("RevokedAt", "CreatedAt")
                WHERE "ReplacedByTokenHash" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsUsed",
                table: "RefreshTokens");
        }
    }
}
