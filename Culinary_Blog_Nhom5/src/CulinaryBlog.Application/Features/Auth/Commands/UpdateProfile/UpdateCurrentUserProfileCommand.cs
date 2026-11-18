using System;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using FluentValidation;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Commands.UpdateProfile;

public sealed record UpdateCurrentUserProfileCommand(
    string UserId,
    string? DisplayName,
    string? Bio,
    string? AvatarUrl) : IRequest<CurrentUserDto>;

public sealed class UpdateCurrentUserProfileCommandValidator : AbstractValidator<UpdateCurrentUserProfileCommand>
{
    public UpdateCurrentUserProfileCommandValidator()
    {
        RuleFor(x => x.UserId)
            .NotEmpty().WithMessage("Authentication required.");

        RuleFor(x => x)
            .Must(x => x.DisplayName is not null || x.Bio is not null || x.AvatarUrl is not null)
            .WithMessage("At least one profile field is required.");

        RuleFor(x => x.DisplayName)
            .MinimumLength(2).When(x => x.DisplayName is not null)
            .MaximumLength(100).When(x => x.DisplayName is not null);

        RuleFor(x => x.Bio)
            .MaximumLength(1000).When(x => x.Bio is not null);

        RuleFor(x => x.AvatarUrl)
            .MaximumLength(500).When(x => x.AvatarUrl is not null)
            .Must(value => string.IsNullOrWhiteSpace(value) ||
                (Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
                (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)))
            .When(x => x.AvatarUrl is not null)
            .WithMessage("AvatarUrl must be an absolute HTTP or HTTPS URL.");
    }
}

public sealed class UpdateCurrentUserProfileCommandHandler(IAuthService authService)
    : IRequestHandler<UpdateCurrentUserProfileCommand, CurrentUserDto>
{
    public Task<CurrentUserDto> Handle(UpdateCurrentUserProfileCommand request, CancellationToken cancellationToken)
    {
        return authService.UpdateCurrentUserAsync(
            request.UserId,
            new UpdateProfileDto(request.DisplayName, request.Bio, request.AvatarUrl),
            cancellationToken);
    }
}
