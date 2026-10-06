using CulinaryBlog.Application.DTOs;
using MediatR;
using Microsoft.AspNetCore.Identity;

namespace CulinaryBlog.Application.Features.Auth.Commands.GoogleLogin;

public sealed record GoogleLoginCommand(ExternalLoginInfo ExternalLoginInfo) : IRequest<AuthResponseDto>;