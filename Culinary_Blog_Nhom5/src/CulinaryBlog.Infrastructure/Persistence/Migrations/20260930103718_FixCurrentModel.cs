using Microsoft.EntityFrameworkCore.Migrations;
using NpgsqlTypes;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class FixCurrentModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The preceding AddSearchVectorToRecipes migration already creates both
            // the column and its GIN index. This scaffolded migration duplicated
            // those operations and made clean upgrades fail with "already exists".
            // Keep this migration as a no-op so databases that recorded the earlier
            // migration can advance their migration history safely.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // SearchVector belongs to AddSearchVectorToRecipes; do not remove it here.
        }
    }
}
