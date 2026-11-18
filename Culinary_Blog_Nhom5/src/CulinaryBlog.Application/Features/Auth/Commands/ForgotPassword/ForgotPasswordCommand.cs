using System.Net.Mail;
using CulinaryBlog.Application.Contracts;
using FluentValidation;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Commands.ForgotPassword;

public sealed record ForgotPasswordCommand(string Email) : IRequest;

public sealed class ForgotPasswordCommandValidator : AbstractValidator<ForgotPasswordCommand>
{
    public ForgotPasswordCommandValidator()
    {
        RuleFor(x => x.Email)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Valid email is required.")
            .MaximumLength(256).WithMessage("Valid email is required.")
            .Must(email => !string.IsNullOrWhiteSpace(email)
                && MailAddress.TryCreate(email, out var parsed)
                && string.Equals(parsed.Address, email.Trim(), StringComparison.OrdinalIgnoreCase))
            .WithMessage("Valid email is required.");
    }
}

public sealed class ForgotPasswordCommandHandler(IAuthService authService)
    : IRequestHandler<ForgotPasswordCommand>
{
    public async Task Handle(ForgotPasswordCommand request, CancellationToken cancellationToken)
    {
        await authService.RequestPasswordResetAsync(request.Email, cancellationToken);
    }
}
