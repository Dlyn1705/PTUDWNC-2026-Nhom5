using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Commands.GoogleLogin;

public sealed class GoogleLoginCommandHandler(IAuthService authService)
    : IRequestHandler<GoogleLoginCommand, AuthResponseDto>
{
    public Task<AuthResponseDto> Handle(GoogleLoginCommand request, CancellationToken cancellationToken)
    {
        return authService.LoginWithGoogleAsync(request.ExternalLoginInfo, cancellationToken);
    }
}