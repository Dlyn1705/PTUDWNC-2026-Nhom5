using CulinaryBlog.Application.DTOs;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Commands.Register;

public sealed record RegisterCommand(
    string Email,
    string DisplayName,
    string Password,
    string ConfirmPassword) : IRequest<AuthResponseDto>;