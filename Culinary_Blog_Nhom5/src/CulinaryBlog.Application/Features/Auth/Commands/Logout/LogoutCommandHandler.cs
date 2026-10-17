using CulinaryBlog.Application.Contracts;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Commands.Logout;

public sealed class LogoutCommandHandler(IAuthService authService)
    : IRequestHandler<LogoutCommand, RefreshTokenRevocationResult>
{
    public Task<RefreshTokenRevocationResult> Handle(
        LogoutCommand request,
        CancellationToken cancellationToken)
    {
        return authService.RevokeRefreshTokenAsync(
            request.RefreshToken,
            request.ExpectedUserId,
            cancellationToken);
    }
}
