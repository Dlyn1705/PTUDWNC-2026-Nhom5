using CulinaryBlog.Application.DTOs;
using FluentValidation;

namespace CulinaryBlog.Application.Features.Auth;

public sealed class UpdateProfileValidator : AbstractValidator<UpdateProfileDto>
{
    public UpdateProfileValidator()
    {
        RuleFor(x => x)
            .Must(x => x.DisplayName is not null || x.Bio is not null || x.AvatarUrl is not null)
            .WithMessage("At least one profile field is required.");
        RuleFor(x => x.DisplayName)
            .MinimumLength(2).When(x => x.DisplayName is not null)
            .MaximumLength(100).When(x => x.DisplayName is not null);
        RuleFor(x => x.Bio).MaximumLength(1000).When(x => x.Bio is not null);
        RuleFor(x => x.AvatarUrl)
            .MaximumLength(500).When(x => x.AvatarUrl is not null)
            .Must(value => string.IsNullOrWhiteSpace(value) ||
                Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
                (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
            .When(x => x.AvatarUrl is not null)
            .WithMessage("AvatarUrl must be an absolute HTTP or HTTPS URL.");
    }
}

public sealed class ChangePasswordValidator : AbstractValidator<ChangePasswordDto>
{
    public ChangePasswordValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
        RuleFor(x => x.NewPassword)
            .NotEmpty()
            .MinimumLength(8)
            .Matches("[A-Z]")
            .Matches("[a-z]")
            .Matches("[0-9]")
            .Matches("[^a-zA-Z0-9]")
            .NotEqual(x => x.CurrentPassword);
    }
}
