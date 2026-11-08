using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EnforceActiveRecipeStepOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Preserve content and normalize legacy numbers before enforcing uniqueness.
            // Bump tokens for affected rows so editors loaded before deployment are stale.
            migrationBuilder.Sql("""
                LOCK TABLE "Recipes", "RecipeSteps" IN SHARE ROW EXCLUSIVE MODE;
                WITH ranked AS (
                    SELECT "Id", ROW_NUMBER() OVER (
                        PARTITION BY "RecipeId" ORDER BY "StepNumber", "CreatedAt", "Id")::integer AS number
                    FROM "RecipeSteps" WHERE "IsDeleted" = false
                ), changed AS (
                    UPDATE "RecipeSteps" AS step SET "StepNumber" = ranked.number,
                        "UpdatedAt" = CURRENT_TIMESTAMP, "RowVersion" = uuid_send(gen_random_uuid())
                    FROM ranked WHERE step."Id" = ranked."Id" AND step."StepNumber" <> ranked.number
                    RETURNING step."RecipeId"
                )
                UPDATE "Recipes" SET "UpdatedAt" = CURRENT_TIMESTAMP, "RowVersion" = uuid_send(gen_random_uuid())
                WHERE "IsDeleted" = false AND "Id" IN (SELECT "RecipeId" FROM changed);
                """);
            migrationBuilder.DropIndex(
                name: "IX_RecipeSteps_RecipeId_StepNumber",
                table: "RecipeSteps");

            migrationBuilder.CreateIndex(
                name: "IX_RecipeSteps_RecipeId_StepNumber",
                table: "RecipeSteps",
                columns: new[] { "RecipeId", "StepNumber" },
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_RecipeSteps_RecipeId_StepNumber",
                table: "RecipeSteps");

            migrationBuilder.CreateIndex(
                name: "IX_RecipeSteps_RecipeId_StepNumber",
                table: "RecipeSteps",
                columns: new[] { "RecipeId", "StepNumber" });
        }
    }
}
