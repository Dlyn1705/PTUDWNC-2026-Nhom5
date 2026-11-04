namespace CulinaryBlog.Domain.Entities;

/// <summary>Deletion intent and attempt cap survive queue and image/recipe row deletion.</summary>
public sealed class RecipeImageDeletionWork
{
    public Guid ImageId { get; set; }
    public Guid RecipeId { get; set; }
    public string Status { get; set; } = "Pending";
    public int AttemptCount { get; set; }
    public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public Guid? LeaseToken { get; set; }
    public DateTime? LeaseExpiresAt { get; set; }
    public string? HangfireJobId { get; set; }
    public string? LastErrorCode { get; set; }
}

/// <summary>Write-ahead original object key; does not cascade with recipe/image metadata.</summary>
public sealed class RecipeImageUploadIntent
{
    public Guid ImageId { get; set; }
    public Guid RecipeId { get; set; }
    public string ObjectKey { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime CleanupAfter { get; set; } = DateTime.UtcNow.AddMinutes(10);
    public DateTime? CleanedAt { get; set; }
    public int CleanupAttemptCount { get; set; }
    public bool Failed { get; set; }
    public string? LastErrorCode { get; set; }
}
