using System;

namespace CulinaryBlog.Domain.Common;

/// <summary>
/// Abstract base class for all domain entities.
/// Supports soft deletion, audit timestamps, and optimistic concurrency control.
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public bool IsDeleted { get; set; } = false;
    public byte[] RowVersion { get; set; } = Array.Empty<byte>();
}
