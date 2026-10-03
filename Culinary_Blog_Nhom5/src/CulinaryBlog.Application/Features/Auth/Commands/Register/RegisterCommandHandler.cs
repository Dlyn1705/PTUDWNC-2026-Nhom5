using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Commands.Register;

public sealed class RegisterCommandHandler : IRequestHandler<RegisterCommand, AuthResponseDto>
{
    private readonly IAuthService _authService;

    public RegisterCommandHandler(IAuthService authService)
    {
        _authService = authService;
    }

    public Task<AuthResponseDto> Handle(RegisterCommand request, CancellationToken cancellationToken)
    {
        return _authService.RegisterAsync(request.Email, request.DisplayName, request.Password, cancellationToken);
    }
}