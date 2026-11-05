namespace CulinaryBlog.Domain.Entities;

public enum WelcomeEmailStatus { Pending, Processing, Sent, Failed, Skipped, NeedsReview }

/// <summary>Durable intent written in the same transaction as the new Identity account.</summary>
public sealed class WelcomeEmailDelivery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string UserId { get; set; } = string.Empty;
    public string MessageType { get; set; } = "Welcome";
    public string RecipientEmail { get; set; } = string.Empty;
    public int TemplateVersion { get; set; } = 1;
    public WelcomeEmailStatus Status { get; set; } = WelcomeEmailStatus.Pending;
    public int AttemptCount { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;
    public DateTime? SentAt { get; set; }
    public string? LastErrorCode { get; set; }
    public string? HangfireJobId { get; set; }
    public Guid? LeaseToken { get; set; }
    public DateTime? LeaseExpiresAt { get; set; }
    public DateTime? SubmissionStartedAt { get; set; }

    public static WelcomeEmailDelivery Create(ApplicationUser user) => new()
    {
        UserId = user.Id,
        RecipientEmail = user.Email ?? throw new InvalidOperationException("A new account requires an email address.")
    };
}

/// <summary>Append-only operator evidence, retained independently of delivery row lifecycle.</summary>
public sealed class WelcomeEmailReconciliationRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DeliveryId { get; set; }
    public string Outcome { get; set; } = "";
    public string ActorId { get; set; } = "";
    public string EvidenceReference { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public int AttemptCount { get; set; }
}
