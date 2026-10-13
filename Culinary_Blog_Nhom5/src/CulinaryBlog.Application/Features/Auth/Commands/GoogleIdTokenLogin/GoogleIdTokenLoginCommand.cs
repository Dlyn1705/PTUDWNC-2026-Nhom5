using CulinaryBlog.Application.DTOs;
using MediatR;

namespace CulinaryBlog.Application.Features.Auth.Commands.GoogleIdTokenLogin;

public sealed record GoogleIdTokenLoginCommand(string IdToken) : IRequest<AuthResponseDto>;