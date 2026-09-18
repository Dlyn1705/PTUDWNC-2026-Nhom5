using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Identity;

namespace CulinaryBlog.Domain.Entities;

public class ApplicationUser : IdentityUser<string>
{
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string? Bio { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public virtual ICollection<Recipe> Recipes { get; set; } = new List<Recipe>();
    public virtual ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();

    public ApplicationUser()
    {
        Id = Guid.NewGuid().ToString();
    }

    public static ApplicationUser Create(string email, string userName, string displayName, string? avatarUrl = null)
    {
        return new ApplicationUser
        {
            Email = email,
            UserName = userName,
            DisplayName = displayName,
            AvatarUrl = avatarUrl,
            CreatedAt = DateTime.UtcNow,
            IsActive = true
        };
    }
}
