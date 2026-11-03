using CulinaryBlog.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CulinaryBlog.Infrastructure.Persistence.Configurations;

public sealed class RecipeImageDeletionWorkConfiguration : IEntityTypeConfiguration<RecipeImageDeletionWork>
{
    public void Configure(EntityTypeBuilder<RecipeImageDeletionWork> builder)
    {
        builder.ToTable("RecipeImageDeletionWork", table => table.HasCheckConstraint("CK_RecipeImageDeletionWork_Attempts", "\"AttemptCount\" BETWEEN 0 AND 4"));
        builder.HasKey(x => x.ImageId);
        builder.Property(x => x.Status).HasMaxLength(20);
        builder.Property(x => x.LastErrorCode).HasMaxLength(50);
        builder.Property(x => x.HangfireJobId).HasMaxLength(100);
        builder.HasIndex(x => new { x.Status, x.NextAttemptAt });
        builder.HasIndex(x => new { x.Status, x.LeaseExpiresAt });
    }
}

public sealed class RecipeImageUploadIntentConfiguration : IEntityTypeConfiguration<RecipeImageUploadIntent>
{
    public void Configure(EntityTypeBuilder<RecipeImageUploadIntent> builder)
    {
        builder.HasKey(x => x.ImageId);
        builder.Property(x => x.ObjectKey).HasMaxLength(500);
        builder.Property(x => x.LastErrorCode).HasMaxLength(50);
        builder.ToTable("RecipeImageUploadIntents", table => table.HasCheckConstraint("CK_RecipeImageUploadIntent_Attempts", "\"CleanupAttemptCount\" BETWEEN 0 AND 4"));
        builder.HasIndex(x => x.CleanupAfter);
    }
}
