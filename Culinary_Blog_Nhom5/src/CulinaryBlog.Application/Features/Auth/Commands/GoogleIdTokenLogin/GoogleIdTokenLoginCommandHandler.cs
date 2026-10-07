using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Commands.GoogleIdTokenLogin;

public sealed class GoogleIdTokenLoginCommandHandler(IAuthService authService)
    : IRequestHandler<GoogleIdTokenLoginCommand, AuthResponseDto>
{
    public Task<AuthResponseDto> Handle(GoogleIdTokenLoginCommand request, CancellationToken cancellationToken)
    {
        return authService.LoginWithGoogleIdTokenAsync(request.IdToken, cancellationToken);
    }
}