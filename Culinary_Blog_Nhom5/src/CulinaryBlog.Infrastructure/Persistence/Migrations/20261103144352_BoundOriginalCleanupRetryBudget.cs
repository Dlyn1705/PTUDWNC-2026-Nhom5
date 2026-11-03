using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BoundOriginalCleanupRetryBudget : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CleanupAttemptCount",
                table: "RecipeImageUploadIntents",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "Failed",
                table: "RecipeImageUploadIntents",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "LastErrorCode",
                table: "RecipeImageUploadIntents",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_RecipeImageUploadIntent_Attempts",
                table: "RecipeImageUploadIntents",
                sql: "\"CleanupAttemptCount\" BETWEEN 0 AND 4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_RecipeImageUploadIntent_Attempts",
                table: "RecipeImageUploadIntents");

            migrationBuilder.DropColumn(
                name: "CleanupAttemptCount",
                table: "RecipeImageUploadIntents");

            migrationBuilder.DropColumn(
                name: "Failed",
                table: "RecipeImageUploadIntents");

            migrationBuilder.DropColumn(
                name: "LastErrorCode",
                table: "RecipeImageUploadIntents");
        }
    }
}
