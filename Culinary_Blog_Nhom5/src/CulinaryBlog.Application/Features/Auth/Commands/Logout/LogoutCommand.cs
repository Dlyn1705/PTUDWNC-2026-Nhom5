using CulinaryBlog.Application.Contracts;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Commands.Logout;

/// <summary>Revokes the refresh-token chain associated with the current session.</summary>
public sealed record LogoutCommand(
    string RefreshToken,
    string ExpectedUserId) : IRequest<RefreshTokenRevocationResult>;
