using CulinaryBlog.Application.Features.Auth.Commands.Register;
using Xunit;

namespace CulinaryBlog.Security.Tests;

public sealed class RegisterCommandValidatorTests
{
    private readonly RegisterCommandValidator _validator = new();

    [Fact]
    public void Accepts_a_valid_non_gmail_email()
    {
        var result = _validator.Validate(new RegisterCommand(
            "chef@culinaryblog.vn",
            "Nguyen Van A",
            "StrongPass1!",
            "StrongPass1!"));

        Assert.True(result.IsValid);
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("")]
    public void Rejects_invalid_email(string email)
    {
        var result = _validator.Validate(new RegisterCommand(
            email,
            "Nguyen Van A",
            "StrongPass1!",
            "StrongPass1!"));

        Assert.Contains(result.Errors, error => error.PropertyName == nameof(RegisterCommand.Email));
    }

    [Fact]
    public void Rejects_mismatched_confirmation_password()
    {
        var result = _validator.Validate(new RegisterCommand(
            "chef@culinaryblog.vn",
            "Nguyen Van A",
            "StrongPass1!",
            "DifferentPass1!"));

        Assert.Contains(result.Errors, error => error.PropertyName == nameof(RegisterCommand.ConfirmPassword));
    }
}
