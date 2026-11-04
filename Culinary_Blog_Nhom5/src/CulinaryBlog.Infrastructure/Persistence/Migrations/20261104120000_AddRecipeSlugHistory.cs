using System;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations;

[DbContext(typeof(ApplicationDbContext))]
[Migration("20261104120000_AddRecipeSlugHistory")]
public partial class AddRecipeSlugHistory : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "RecipeSlugHistories",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                RecipeId = table.Column<Guid>(type: "uuid", nullable: false),
                OldSlug = table.Column<string>(type: "character varying(220)", maxLength: 220, nullable: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_RecipeSlugHistories", x => x.Id);
                table.ForeignKey(
                    name: "FK_RecipeSlugHistories_Recipes_RecipeId",
                    column: x => x.RecipeId,
                    principalTable: "Recipes",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_RecipeSlugHistories_OldSlug",
            table: "RecipeSlugHistories",
            column: "OldSlug",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_RecipeSlugHistories_RecipeId",
            table: "RecipeSlugHistories",
            column: "RecipeId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "RecipeSlugHistories");
    }
}
