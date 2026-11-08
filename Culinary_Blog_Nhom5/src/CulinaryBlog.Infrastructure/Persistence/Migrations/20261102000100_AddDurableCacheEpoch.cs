using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CulinaryBlog.Infrastructure.Persistence.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20261102000100_AddDurableCacheEpoch")]
public sealed class AddDurableCacheEpoch : Migration
{
    private static readonly string[] Tables = ["Recipes", "Categories", "RecipeIngredients", "RecipeSteps", "RecipeImages", "AspNetUsers"];
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE public.cache_epoch (id integer PRIMARY KEY CHECK (id = 1), generation bigint NOT NULL);
            INSERT INTO public.cache_epoch VALUES (1, 1);
            CREATE FUNCTION public.advance_cache_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              UPDATE public.cache_epoch SET generation = generation + 1 WHERE id = 1;
              RETURN NULL;
            END $$;
            """);
        foreach (var table in Tables)
            migrationBuilder.Sql($"CREATE TRIGGER reliability_cache_epoch AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON \"{table}\" FOR EACH STATEMENT EXECUTE FUNCTION public.advance_cache_epoch();");
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        foreach (var table in Tables)
            migrationBuilder.Sql($"DROP TRIGGER IF EXISTS reliability_cache_epoch ON \"{table}\";");
        migrationBuilder.Sql("DROP FUNCTION public.advance_cache_epoch(); DROP TABLE public.cache_epoch;");
    }
}
