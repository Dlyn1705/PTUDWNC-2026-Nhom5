using System.Text.Json;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Exceptions;
using FluentValidation;

namespace CulinaryBlog.Application.Features.Recipes.Steps;

public sealed record StepInput(string? Description, string? Title = null, int? TimerMinutes = null, string? ImageUrl = null);
public sealed record StepDto(Guid Id, Guid RecipeId, int StepNumber, string Title, string Description, int? TimerMinutes, string? ImageUrl);
public sealed record StepSnapshot(IReadOnlyList<StepDto> Steps, string RowVersion);
public enum StepOperation { Add, Update, Delete, Reorder }
public sealed record StepMutation(Guid RecipeId, StepOperation Operation, byte[] ExpectedVersion,
    Guid? StepId = null, StepInput? Input = null, IReadOnlyList<Guid>? StepIds = null);
public sealed record RecipePublishResult(Guid Id, Domain.Enums.RecipeStatus Status, DateTime? PublishedAt,
    [property: System.Text.Json.Serialization.JsonIgnore] bool WasPublished = false);

public sealed class StepInputValidator : AbstractValidator<StepInput>
{
    public StepInputValidator()
    {
        RuleFor(x => x.Description).Must(x => !string.IsNullOrWhiteSpace(x) && x.Trim().Length <= 2000)
            .WithMessage("Mô tả bước bắt buộc, tối đa 2.000 ký tự.");
        RuleFor(x => x.Title).Must(x => x?.Trim().Length is null or <= 200).WithMessage("Tiêu đề tối đa 200 ký tự.");
        RuleFor(x => x.TimerMinutes).Must(x => x is null or >= 0).WithMessage("Hẹn giờ phải là số nguyên không âm.");
        RuleFor(x => x.ImageUrl).Must(x => string.IsNullOrWhiteSpace(x) ||
            (x.Trim().Length <= 500 && Uri.TryCreate(x.Trim(), UriKind.Absolute, out var uri)
             && uri.Scheme is "http" or "https" && string.IsNullOrEmpty(uri.UserInfo)))
            .WithMessage("Ảnh phải là URL HTTP/HTTPS hợp lệ, tối đa 500 ký tự, không có thông tin đăng nhập.");
    }
}

public static class StepRules
{
    public const int MaximumCount = 100;
    public static void Validate(StepInput input, string prefix = "")
    {
        var errors = new StepInputValidator().Validate(input).Errors;
        if (errors.Count > 0) throw new Domain.Exceptions.ValidationException(errors.GroupBy(x => prefix + x.PropertyName)
            .ToDictionary(x => x.Key, x => x.Select(e => e.ErrorMessage).ToArray()));
    }

    public static void EnsureOwner(Recipe recipe, ICurrentUserService user)
    {
        if (recipe.IsDeleted) throw new NotFoundException("Recipe", recipe.Id);
        if (!user.IsAuthenticated || string.IsNullOrWhiteSpace(user.UserId) ||
            (!user.IsAdmin && (!user.Roles.Contains("Author") || user.UserId != recipe.AuthorId)))
            throw new ForbiddenException("Chỉ tác giả sở hữu hoặc Admin mới được quản lý bước thực hiện.");
    }

    public static void Apply(RecipeStep step, StepInput input)
    {
        Validate(input);
        step.Title = string.IsNullOrWhiteSpace(input.Title) ? $"Bước {step.StepNumber}" : input.Title.Trim();
        step.Description = input.Description!.Trim();
        step.TimerMinutes = input.TimerMinutes;
        step.ImageUrl = string.IsNullOrWhiteSpace(input.ImageUrl) ? null : input.ImageUrl.Trim();
    }

    // Deliberately local to this contract: do not change JSON handling of unrelated APIs.
    public static StepInput Parse(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object) throw new Domain.Exceptions.ValidationException("step", "Dữ liệu bước phải là object.");
        var seen = new HashSet<string>();
        foreach (var property in body.EnumerateObject())
            if (property.Name is not ("title" or "description" or "timerMinutes" or "imageUrl") || !seen.Add(property.Name))
                throw new Domain.Exceptions.ValidationException(property.Name, "Trường không được hỗ trợ hoặc bị lặp; server quản lý số thứ tự bước.");
        string? ReadString(string key)
        {
            if (!body.TryGetProperty(key, out var value) || value.ValueKind == JsonValueKind.Null) return null;
            if (value.ValueKind != JsonValueKind.String) throw new Domain.Exceptions.ValidationException(key, "Giá trị phải là chuỗi hoặc null.");
            return value.GetString();
        }
        int? timer = null;
        if (body.TryGetProperty("timerMinutes", out var raw) && raw.ValueKind != JsonValueKind.Null)
        {
            if (raw.ValueKind != JsonValueKind.Number || !raw.TryGetInt32(out var minutes))
                throw new Domain.Exceptions.ValidationException("timerMinutes", "Hẹn giờ phải là số nguyên hợp lệ.");
            timer = minutes;
        }
        return new(ReadString("description"), ReadString("title"), timer, ReadString("imageUrl"));
    }

    public static StepDto ToDto(RecipeStep step) => new(step.Id, step.RecipeId, step.StepNumber,
        step.Title, step.Description, step.TimerMinutes, step.ImageUrl);
}
