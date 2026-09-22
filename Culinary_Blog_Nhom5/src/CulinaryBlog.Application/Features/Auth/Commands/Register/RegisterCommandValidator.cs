using FluentValidation;

namespace CulinaryBlog.Application.Features.Auth.Commands.Register;

public sealed class RegisterCommandValidator : AbstractValidator<RegisterCommand>
{
    public RegisterCommandValidator()
    {
        RuleFor(x => x.Email)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Email là bắt buộc.")
            .EmailAddress().WithMessage("Email không đúng định dạng.")
            .MaximumLength(256).WithMessage("Email không được vượt quá 256 ký tự.");

        RuleFor(x => x.DisplayName)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Tên hiển thị là bắt buộc.")
            .MinimumLength(2).WithMessage("Tên hiển thị phải có ít nhất 2 ký tự.")
            .MaximumLength(100).WithMessage("Tên hiển thị không được vượt quá 100 ký tự.");

        RuleFor(x => x.Password)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Mật khẩu là bắt buộc.")
            .MinimumLength(8).WithMessage("Mật khẩu phải có ít nhất 8 ký tự.")
            .Matches("[A-Z]").WithMessage("Mật khẩu phải chứa ít nhất một chữ hoa.")
            .Matches("[a-z]").WithMessage("Mật khẩu phải chứa ít nhất một chữ thường.")
            .Matches("[0-9]").WithMessage("Mật khẩu phải chứa ít nhất một chữ số.")
            .Matches("[^a-zA-Z0-9]").WithMessage("Mật khẩu phải chứa ít nhất một ký tự đặc biệt.");

        RuleFor(x => x.ConfirmPassword)
            .Equal(x => x.Password).WithMessage("Mật khẩu xác nhận không khớp.");
    }
}