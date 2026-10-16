using CulinaryBlog.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CulinaryBlog.Infrastructure.Persistence.Configurations;

public sealed class RecipeImageWorkConfiguration : IEntityTypeConfiguration<RecipeImageWork>
{
    public void Configure(EntityTypeBuilder<RecipeImageWork> builder)
    {
        builder.ToTable("RecipeImageWork", table => table.HasCheckConstraint("CK_RecipeImageWork_Attempts", "\"AttemptCount\" BETWEEN 0 AND 4"));
        builder.HasKey(x => x.ImageId);
        builder.Property(x => x.Status).HasMaxLength(20);
        builder.Property(x => x.LastErrorCode).HasMaxLength(50);
        builder.Property(x => x.HangfireJobId).HasMaxLength(100);
        builder.HasIndex(x => new { x.Status, x.NextAttemptAt });
        builder.HasIndex(x => new { x.Status, x.LeaseExpiresAt });
    }
}

public sealed class RecipeImageGenerationConfiguration : IEntityTypeConfiguration<RecipeImageGeneration>
{
    public void Configure(EntityTypeBuilder<RecipeImageGeneration> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Ignore(x => x.MediumKey); builder.Ignore(x => x.ThumbnailKey);
        builder.HasIndex(x => x.ImageId);
        builder.HasIndex(x => x.CleanupAfter);
    }
}
