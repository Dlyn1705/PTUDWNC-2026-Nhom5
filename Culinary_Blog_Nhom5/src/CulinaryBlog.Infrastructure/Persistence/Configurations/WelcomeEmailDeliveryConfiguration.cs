using CulinaryBlog.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CulinaryBlog.Infrastructure.Persistence.Configurations;

public sealed class WelcomeEmailDeliveryConfiguration : IEntityTypeConfiguration<WelcomeEmailDelivery>
{
    public void Configure(EntityTypeBuilder<WelcomeEmailDelivery> builder)
    {
        builder.ToTable("WelcomeEmailDeliveries", table => table.HasCheckConstraint(
            "CK_WelcomeEmailDeliveries_AttemptCount", "\"AttemptCount\" BETWEEN 0 AND 4"));
        builder.HasKey(x => x.Id);
        builder.Property(x => x.UserId).HasMaxLength(450).IsRequired();
        builder.Property(x => x.MessageType).HasMaxLength(30).IsRequired();
        builder.Property(x => x.RecipientEmail).HasMaxLength(256).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.LastErrorCode).HasMaxLength(50);
        builder.Property(x => x.HangfireJobId).HasMaxLength(100);
        builder.HasIndex(x => new { x.UserId, x.MessageType }).IsUnique();
        builder.HasIndex(x => new { x.Status, x.NextAttemptAt });
        builder.HasIndex(x => new { x.Status, x.LeaseExpiresAt });
        // No FK: deleting an Identity account leaves a recoverable intent which the worker marks Skipped.
    }
}
