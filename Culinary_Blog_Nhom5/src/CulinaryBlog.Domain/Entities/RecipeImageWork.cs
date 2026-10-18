namespace CulinaryBlog.Domain.Entities;

/// <summary>Durable processing intent. No FK: cleanup must survive image/recipe cascade deletion.</summary>
public sealed class RecipeImageWork
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

/// <summary>Write-ahead object manifest, retained independently of the image row.</summary>
public sealed class RecipeImageGeneration
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ImageId { get; set; }
    public Guid RecipeId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime CleanupAfter { get; set; } = DateTime.UtcNow.AddMinutes(5);
    public DateTime? CleanedAt { get; set; }
    public string MediumKey => $"recipes/{RecipeId}/{ImageId:N}/{Id:N}/medium.jpg";
    public string ThumbnailKey => $"recipes/{RecipeId}/{ImageId:N}/{Id:N}/thumbnail.jpg";
}
