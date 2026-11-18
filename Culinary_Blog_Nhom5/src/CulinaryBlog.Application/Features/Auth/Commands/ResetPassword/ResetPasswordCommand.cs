using System.Net.Mail;
using CulinaryBlog.Application.Contracts;
using FluentValidation;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Commands.ResetPassword;

public sealed record ResetPasswordCommand(string Email, string Token, string NewPassword) : IRequest;

public sealed class ResetPasswordCommandValidator : AbstractValidator<ResetPasswordCommand>
{
    public ResetPasswordCommandValidator()
    {
        RuleFor(x => x.Email)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Valid email is required.")
            .MaximumLength(256).WithMessage("Valid email is required.")
            .Must(email => !string.IsNullOrWhiteSpace(email)
                && MailAddress.TryCreate(email, out var parsed)
                && string.Equals(parsed.Address, email.Trim(), StringComparison.OrdinalIgnoreCase))
            .WithMessage("Valid email is required.");

        RuleFor(x => x.Token)
            .NotEmpty().WithMessage("Invalid reset token.")
            .MaximumLength(256).WithMessage("Invalid reset token.");

        RuleFor(x => x.NewPassword)
            .NotEmpty().WithMessage("New password is required.");
    }
}

public sealed class ResetPasswordCommandHandler(IAuthService authService)
    : IRequestHandler<ResetPasswordCommand>
{
    public async Task Handle(ResetPasswordCommand request, CancellationToken cancellationToken)
    {
        await authService.ResetPasswordAsync(request.Email, request.Token, request.NewPassword, cancellationToken);
    }
}
