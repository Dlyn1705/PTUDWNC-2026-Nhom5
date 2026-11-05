using CulinaryBlog.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CulinaryBlog.Infrastructure.Persistence.Configurations;

public sealed class RecipeSlugHistoryConfiguration : IEntityTypeConfiguration<RecipeSlugHistory>
{
    public void Configure(EntityTypeBuilder<RecipeSlugHistory> builder)
    {
        builder.ToTable("RecipeSlugHistories");
        builder.HasKey(history => history.Id);
        builder.Property(history => history.OldSlug).HasMaxLength(220).IsRequired();
        builder.Property(history => history.CreatedAt).IsRequired();
        builder.HasIndex(history => history.OldSlug)
            .IsUnique()
            .HasDatabaseName("IX_RecipeSlugHistories_OldSlug");
        builder.HasIndex(history => history.RecipeId);
        builder.HasOne(history => history.Recipe)
            .WithMany(recipe => recipe.SlugHistory)
            .HasForeignKey(history => history.RecipeId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
