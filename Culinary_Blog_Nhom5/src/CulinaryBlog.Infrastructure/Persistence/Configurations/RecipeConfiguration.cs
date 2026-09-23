using CulinaryBlog.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CulinaryBlog.Infrastructure.Persistence.Configurations;

public class RecipeConfiguration : IEntityTypeConfiguration<Recipe>
{
    public void Configure(EntityTypeBuilder<Recipe> builder)
    {
        builder.ToTable("Recipes");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.Title)
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(r => r.Slug)
            .HasMaxLength(220)
            .IsRequired();

        builder.HasIndex(r => r.Slug)
            .IsUnique();

        builder.Property(r => r.Description)
            .HasColumnType("text")
            .IsRequired();

        builder.Property(r => r.Instructions)
            .HasColumnType("text")
            .IsRequired();

        builder.Property(r => r.Difficulty)
            .HasConversion<short>();

        builder.Property(r => r.Status)
            .HasConversion<short>();

        builder.Property(r => r.RowVersion)
            .IsConcurrencyToken()
            .ValueGeneratedNever()
            .IsRequired();

        // Owned Entity: RecipeNutrition (nhúng cột tiền tố Nutrition_)
        builder.OwnsOne(r => r.Nutrition, n =>
        {
            n.Property(p => p.Calories).HasColumnName("Nutrition_Calories").HasPrecision(8, 2);
            n.Property(p => p.Protein).HasColumnName("Nutrition_Protein").HasPrecision(8, 2);
            n.Property(p => p.Carbohydrates).HasColumnName("Nutrition_Carbohydrates").HasPrecision(8, 2);
            n.Property(p => p.Fat).HasColumnName("Nutrition_Fat").HasPrecision(8, 2);
            n.Property(p => p.Fiber).HasColumnName("Nutrition_Fiber").HasPrecision(8, 2);
            n.Property(p => p.Sodium).HasColumnName("Nutrition_Sodium").HasPrecision(8, 2);
        });

        // Foreign Key: Category (OnDelete Restrict để không xóa category còn recipe)
        builder.HasOne(r => r.Category)
            .WithMany(c => c.Recipes)
            .HasForeignKey(r => r.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        // Foreign Key: Author (ApplicationUser)
        builder.HasOne(r => r.Author)
            .WithMany(u => u.Recipes)
            .HasForeignKey(r => r.AuthorId)
            .OnDelete(DeleteBehavior.Restrict);

        // Indexes
        builder.HasIndex(r => r.CategoryId);
        builder.HasIndex(r => r.AuthorId);
        builder.HasIndex(r => r.Status);
        builder.HasIndex(r => r.Difficulty);

        // Soft delete global query filter
        builder.HasQueryFilter(r => !r.IsDeleted);
    }
}
