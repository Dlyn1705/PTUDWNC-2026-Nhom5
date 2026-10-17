using Microsoft.EntityFrameworkCore.Migrations;
using NpgsqlTypes;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchVectorToRecipes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<NpgsqlTsVector>(
                name: "SearchVector",
                table: "Recipes",
                type: "tsvector",
                nullable: true);

            migrationBuilder.Sql(@"
                CREATE OR REPLACE FUNCTION recipes_search_vector_update() RETURNS trigger AS $$
                BEGIN
                    NEW.""SearchVector"" :=
                        setweight(to_tsvector('simple', unaccent(replace(replace(coalesce(NEW.""Title"", ''), 'đ', 'd'), 'Đ', 'D'))), 'A') ||
                        setweight(to_tsvector('simple', unaccent(replace(replace(coalesce(NEW.""Description"", ''), 'đ', 'd'), 'Đ', 'D'))), 'B');
                    RETURN NEW;
                END
                $$ LANGUAGE plpgsql;
            ");

            migrationBuilder.Sql(@"
                DROP TRIGGER IF EXISTS trg_recipes_search_vector_update ON ""Recipes"";
                CREATE TRIGGER trg_recipes_search_vector_update
                BEFORE INSERT OR UPDATE OF ""Title"", ""Description"" ON ""Recipes""
                FOR EACH ROW EXECUTE FUNCTION recipes_search_vector_update();
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Recipes_SearchVector",
                table: "Recipes",
                column: "SearchVector")
                .Annotation("Npgsql:IndexMethod", "GIN");

            migrationBuilder.Sql(@"
                UPDATE ""Recipes""
                SET ""SearchVector"" =
                    setweight(to_tsvector('simple', unaccent(replace(replace(coalesce(""Title"", ''), 'đ', 'd'), 'Đ', 'D'))), 'A') ||
                    setweight(to_tsvector('simple', unaccent(replace(replace(coalesce(""Description"", ''), 'đ', 'd'), 'Đ', 'D'))), 'B');
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DROP TRIGGER IF EXISTS trg_recipes_search_vector_update ON ""Recipes"";");
            migrationBuilder.Sql(@"DROP FUNCTION IF EXISTS recipes_search_vector_update();");

            migrationBuilder.DropIndex(
                name: "IX_Recipes_SearchVector",
                table: "Recipes");

            migrationBuilder.DropColumn(
                name: "SearchVector",
                table: "Recipes");
        }
    }
}
