using CulinaryBlog.Domain.Exceptions;

namespace CulinaryBlog.Application.Features.Recipes.Commands.UpdateRecipe;

public static class RecipeUpdateVersion
{
    public static byte[] Parse(string? body, string? header)
    {
        byte[] Decode(string value)
        {
            if (value.Length > 1024) throw Invalid();
            try
            {
                var bytes = Convert.FromBase64String(value);
                return bytes.Length is > 0 and <= 128 ? bytes : throw Invalid();
            }
            catch (FormatException) { throw Invalid(); }
        }
        byte[]? bodyVersion = string.IsNullOrWhiteSpace(body) ? null : Decode(body.Trim());
        byte[]? headerVersion = null;
        if (!string.IsNullOrWhiteSpace(header))
        {
            var value = header.Trim();
            // Accept one strong ETag only. Wildcards and weak/list ETags cannot protect a specific edit.
            if (value.Length < 3 || value[0] != '"' || value[^1] != '"' || value.Contains(',')) throw Invalid();
            headerVersion = Decode(value[1..^1]);
        }
        if (bodyVersion is not null && headerVersion is not null && !bodyVersion.SequenceEqual(headerVersion))
            throw new ValidationException("RowVersion", "RowVersion và If-Match phải cùng một phiên bản.");
        return bodyVersion ?? headerVersion ?? throw new ValidationException("RowVersion",
            "RowVersion hoặc If-Match là bắt buộc khi cập nhật công thức.");
    }

    private static ValidationException Invalid() => new("RowVersion",
        "RowVersion phải là Base64; If-Match phải là một ETag mạnh được đặt trong dấu nháy kép.");
}
