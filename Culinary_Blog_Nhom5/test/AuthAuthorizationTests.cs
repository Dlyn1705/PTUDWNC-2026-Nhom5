using System.Security.Claims;
using CulinaryBlog.Application.Common.Authorization;
using CulinaryBlog.Application.Features.Auth.Commands.Refresh;
using CulinaryBlog.Application.Features.Auth.Commands.Register;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Xunit;

namespace CulinaryBlog.Tests;

public sealed class RecipeAuthorizationHandlerTests
{
    [Theory]
    [InlineData("Author", "author-1", "author-1", "Update", true)]
    [InlineData("Author", "author-2", "author-1", "Update", false)]
    [InlineData("Author", "author-2", "author-1", "Delete", false)]
    [InlineData("Admin", "admin-1", "author-1", "Delete", true)]
    [InlineData(null, "guest", "author-1", "Delete", false)]
    public async Task Mutation_requires_owner_unless_admin(
        string? role,
        string userId,
        string authorId,
        string operationName,
        bool expected)
    {
        var operation = operationName switch
        {
            "Update" => RecipeOperations.Update,
            "Delete" => RecipeOperations.Delete,
            _ => throw new ArgumentOutOfRangeException(nameof(operationName))
        };

        var succeeded = await AuthorizeAsync(role, userId, authorId, operation);

        Assert.Equal(expected, succeeded);
    }

    [Fact]
    public async Task Guest_can_read_published_recipe_but_not_draft()
    {
        var published = await AuthorizeAsync(
            null, "guest", "author-1", RecipeOperations.Read, RecipeStatus.Published);
        var draft = await AuthorizeAsync(
            null, "guest", "author-1", RecipeOperations.Read, RecipeStatus.Draft);

        Assert.True(published);
        Assert.False(draft);
    }

    [Fact]
    public async Task Author_can_read_own_draft()
    {
        var succeeded = await AuthorizeAsync(
            "Author", "author-1", "author-1", RecipeOperations.Read, RecipeStatus.Draft);

        Assert.True(succeeded);
    }

    private static async Task<bool> AuthorizeAsync(
        string? role,
        string userId,
        string authorId,
        Microsoft.AspNetCore.Authorization.Infrastructure.OperationAuthorizationRequirement operation,
        RecipeStatus status = RecipeStatus.Draft)
    {
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, userId) };
        if (role is not null)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "test"));
        var recipe = new Recipe { AuthorId = authorId, Status = status };
        var context = new AuthorizationHandlerContext([operation], principal, recipe);

        await new RecipeAuthorizationHandler().HandleAsync(context);
        return context.HasSucceeded;
    }
}

public sealed class AuthValidationTests
{
    [Theory]
    [InlineData("valid-refresh-token", true)]
    [InlineData("", false)]
    [InlineData("\n", false)]
    public async Task Refresh_command_validates_token(string token, bool expected)
    {
        var validator = new RefreshTokenCommandValidator();
        var result = await validator.ValidateAsync(new RefreshTokenCommand(token));

        Assert.Equal(expected, result.IsValid);
    }

    [Fact]
    public async Task Refresh_command_rejects_oversized_token()
    {
        var validator = new RefreshTokenCommandValidator();
        var result = await validator.ValidateAsync(new RefreshTokenCommand(new string('x', 257)));

        Assert.False(result.IsValid);
    }

    [Fact]
    public async Task Register_command_accepts_valid_credentials()
    {
        var validator = new RegisterCommandValidator();
        var command = new RegisterCommand(
            "chef@example.com", "Test Chef", "SecurePass123!", "SecurePass123!");

        var result = await validator.ValidateAsync(command);

        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task Register_command_rejects_password_confirmation_mismatch()
    {
        var validator = new RegisterCommandValidator();
        var command = new RegisterCommand(
            "chef@example.com", "Test Chef", "SecurePass123!", "OtherPass123!");

        var result = await validator.ValidateAsync(command);

        Assert.Contains(result.Errors, error => error.PropertyName == nameof(command.ConfirmPassword));
    }
}

public sealed class RefreshTokenTests
{
    [Fact]
    public void Revoke_marks_old_token_and_records_its_replacement()
    {
        var token = new RefreshToken { ExpiresAt = DateTime.UtcNow.AddDays(7) };

        token.Revoke("replacement-hash");

        Assert.True(token.IsRevoked);
        Assert.False(token.IsActive);
        Assert.NotNull(token.RevokedAt);
        Assert.Equal("replacement-hash", token.ReplacedByTokenHash);
    }
}
