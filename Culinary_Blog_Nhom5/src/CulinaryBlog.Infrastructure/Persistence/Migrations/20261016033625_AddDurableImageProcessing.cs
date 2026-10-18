using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDurableImageProcessing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RecipeImageGenerations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ImageId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipeId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CleanupAfter = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CleanedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecipeImageGenerations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RecipeImageWork",
                columns: table => new
                {
                    ImageId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LeaseToken = table.Column<Guid>(type: "uuid", nullable: true),
                    LeaseExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    HangfireJobId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LastErrorCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecipeImageWork", x => x.ImageId);
                    table.CheckConstraint("CK_RecipeImageWork_Attempts", "\"AttemptCount\" BETWEEN 0 AND 4");
                });

            migrationBuilder.CreateIndex(
                name: "IX_RecipeImageGenerations_CleanupAfter",
                table: "RecipeImageGenerations",
                column: "CleanupAfter");

            migrationBuilder.CreateIndex(
                name: "IX_RecipeImageGenerations_ImageId",
                table: "RecipeImageGenerations",
                column: "ImageId");

            migrationBuilder.CreateIndex(
                name: "IX_RecipeImageWork_Status_LeaseExpiresAt",
                table: "RecipeImageWork",
                columns: new[] { "Status", "LeaseExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RecipeImageWork_Status_NextAttemptAt",
                table: "RecipeImageWork",
                columns: new[] { "Status", "NextAttemptAt" });

            migrationBuilder.Sql("""
                CREATE FUNCTION create_recipe_image_work() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                  INSERT INTO "RecipeImageWork" ("ImageId", "RecipeId", "Status", "AttemptCount", "NextAttemptAt", "UpdatedAt")
                  VALUES (NEW."Id", NEW."RecipeId", 'Pending', 0, now(), now()) ON CONFLICT DO NOTHING;
                  RETURN NEW;
                END; $$;
                CREATE TRIGGER trg_recipe_image_work AFTER INSERT ON "RecipeImages"
                  FOR EACH ROW EXECUTE FUNCTION create_recipe_image_work();

                INSERT INTO "RecipeImageWork" ("ImageId", "RecipeId", "Status", "AttemptCount", "NextAttemptAt", "UpdatedAt", "LastErrorCode")
                SELECT "Id", "RecipeId",
                  CASE WHEN "IsDeleted" THEN 'Skipped'
                       WHEN "ProcessingStatus" = 'Completed' AND "MediumUrl" IS NOT NULL AND "ThumbnailUrl" IS NOT NULL THEN 'Completed'
                       WHEN "ProcessingStatus" = 'Failed' THEN 'Failed' ELSE 'Pending' END,
                  0, now() + interval '5 minutes', now(), 'LegacyBackfill'
                FROM "RecipeImages";
                UPDATE "RecipeImages" SET "ProcessingStatus" = 'Pending'
                WHERE NOT "IsDeleted" AND "Id" IN (SELECT "ImageId" FROM "RecipeImageWork" WHERE "Status" = 'Pending');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_recipe_image_work ON \"RecipeImages\"; DROP FUNCTION IF EXISTS create_recipe_image_work();");
            migrationBuilder.DropTable(
                name: "RecipeImageGenerations");

            migrationBuilder.DropTable(
                name: "RecipeImageWork");
        }
    }
}
