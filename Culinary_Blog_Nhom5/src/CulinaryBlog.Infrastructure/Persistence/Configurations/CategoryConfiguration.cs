using CulinaryBlog.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CulinaryBlog.Infrastructure.Persistence.Configurations;

public class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.ToTable("Categories");

        builder.HasKey(c => c.Id);

        builder.Property(c => c.Name)
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(c => c.Slug)
            .HasMaxLength(120)
            .IsRequired();

        builder.HasIndex(c => c.Slug)
            .IsUnique();

        builder.Property(c => c.Description)
            .HasColumnType("text");

        builder.Property(c => c.ImageUrl)
            .HasMaxLength(500);

        builder.Property(c => c.OrderIndex)
            .HasDefaultValue(0);

        // PostgreSQL: dùng concurrency token, không dùng SQL Server rowversion
        builder.Property(c => c.RowVersion)
            .IsConcurrencyToken()
            .ValueGeneratedNever()
            .IsRequired();

        // Soft delete global query filter
        builder.HasQueryFilter(c => !c.IsDeleted);
    }
}