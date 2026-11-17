using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Queries.GetCurrentUser;

public sealed record GetCurrentUserQuery(string UserId) : IRequest<CurrentUserDto>;

public sealed class GetCurrentUserQueryHandler(IAuthService authService)
    : IRequestHandler<GetCurrentUserQuery, CurrentUserDto>
{
    public Task<CurrentUserDto> Handle(GetCurrentUserQuery request, CancellationToken cancellationToken)
    {
        return authService.GetCurrentUserAsync(request.UserId, cancellationToken);
    }
}
