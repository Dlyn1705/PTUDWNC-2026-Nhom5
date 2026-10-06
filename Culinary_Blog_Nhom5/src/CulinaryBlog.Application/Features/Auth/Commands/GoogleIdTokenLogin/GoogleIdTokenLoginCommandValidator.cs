using FluentValidation;

namespace CulinaryBlog.Application.Features.Auth.Commands.GoogleIdTokenLogin;

public sealed class GoogleIdTokenLoginCommandValidator : AbstractValidator<GoogleIdTokenLoginCommand>
{
    public GoogleIdTokenLoginCommandValidator()
    {
        RuleFor(command => command.IdToken)
            .NotEmpty()
            .MaximumLength(16_384);
    }
}