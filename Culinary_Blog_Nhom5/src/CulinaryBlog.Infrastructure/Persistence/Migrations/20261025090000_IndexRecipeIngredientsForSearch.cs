using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CulinaryBlog.Infrastructure.Persistence.Migrations;

// SQL-only migration: no model/snapshot changes or edits to previously applied migrations.
[DbContext(typeof(ApplicationDbContext))]
[Migration("20261025090000_IndexRecipeIngredientsForSearch")]
public sealed class IndexRecipeIngredientsForSearch : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE OR REPLACE FUNCTION recipes_search_vector_update() RETURNS trigger AS $$
            BEGIN
                NEW."SearchVector" :=
                    setweight(to_tsvector('simple', unaccent(translate(coalesce(NEW."Title", ''), 'đĐ', 'dD'))), 'A') ||
                    setweight(to_tsvector('simple', unaccent(translate(coalesce(NEW."Description", ''), 'đĐ', 'dD'))), 'B') ||
                    setweight(to_tsvector('simple', unaccent(translate(coalesce((
                        SELECT string_agg(i."Name", ' ' ORDER BY i."Id")
                        FROM "RecipeIngredients" i
                        WHERE i."RecipeId" = NEW."Id" AND NOT i."IsDeleted"
                    ), ''), 'đĐ', 'dD'))), 'C');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;

            CREATE FUNCTION recipe_ingredients_refresh_search() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    UPDATE "Recipes" SET "Title" = "Title" WHERE "Id" = OLD."RecipeId";
                ELSE
                    IF TG_OP = 'UPDATE' AND OLD."RecipeId" <> NEW."RecipeId" THEN
                        UPDATE "Recipes" SET "Title" = "Title" WHERE "Id" = OLD."RecipeId";
                    END IF;
                    UPDATE "Recipes" SET "Title" = "Title" WHERE "Id" = NEW."RecipeId";
                END IF;
                RETURN NULL;
            END
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER trg_recipe_ingredients_refresh_search
                AFTER INSERT OR UPDATE OF "Name", "IsDeleted", "RecipeId" OR DELETE ON "RecipeIngredients"
                FOR EACH ROW EXECUTE FUNCTION recipe_ingredients_refresh_search();

            UPDATE "Recipes" SET "Title" = "Title";
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TRIGGER IF EXISTS trg_recipe_ingredients_refresh_search ON "RecipeIngredients";
            DROP FUNCTION IF EXISTS recipe_ingredients_refresh_search();
            CREATE OR REPLACE FUNCTION recipes_search_vector_update() RETURNS trigger AS $$
            BEGIN
                NEW."SearchVector" :=
                    setweight(to_tsvector('simple', unaccent(translate(coalesce(NEW."Title", ''), 'đĐ', 'dD'))), 'A') ||
                    setweight(to_tsvector('simple', unaccent(translate(coalesce(NEW."Description", ''), 'đĐ', 'dD'))), 'B');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
            UPDATE "Recipes" SET "Title" = "Title";
            """);
    }
}
