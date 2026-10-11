using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRecipeImageProcessingStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'RecipeImages'
                          AND column_name = 'ProcessingStatus'
                    ) THEN
                        ALTER TABLE "RecipeImages"
                            ADD COLUMN "ProcessingStatus" character varying(20) NOT NULL DEFAULT 'Pending';
                    END IF;
                END $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "RecipeImages" DROP COLUMN IF EXISTS "ProcessingStatus";
                """);
        }
    }
}
