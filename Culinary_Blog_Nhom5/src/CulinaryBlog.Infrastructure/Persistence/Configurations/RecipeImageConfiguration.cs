using CulinaryBlog.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CulinaryBlog.Infrastructure.Persistence.Configurations;

public class RecipeImageConfiguration : IEntityTypeConfiguration<RecipeImage>
{
    public void Configure(EntityTypeBuilder<RecipeImage> builder)
    {
        builder.ToTable("RecipeImages");

        builder.HasKey(img => img.Id);

        builder.Property(img => img.OriginalUrl)
            .HasMaxLength(500)
            .IsRequired();

        builder.Property(img => img.MediumUrl)
            .HasMaxLength(500);

        builder.Property(img => img.ThumbnailUrl)
            .HasMaxLength(500);

        builder.Property(img => img.AltText)
            .HasMaxLength(200);

        builder.Property(img => img.IsPrimary)
            .HasDefaultValue(false);

        builder.Property(img => img.OrderIndex)
            .HasDefaultValue(0);

        builder.Property(img => img.RowVersion)
            .IsRowVersion();

        builder.HasOne(img => img.Recipe)
            .WithMany(r => r.Images)
            .HasForeignKey(img => img.RecipeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasQueryFilter(img => !img.IsDeleted);
    }
}
