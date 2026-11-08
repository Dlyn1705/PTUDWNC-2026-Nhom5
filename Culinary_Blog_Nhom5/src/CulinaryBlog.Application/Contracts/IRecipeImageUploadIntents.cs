namespace CulinaryBlog.Application.Contracts;

public interface IRecipeImageUploadIntents
{
    Task BeginAsync(Guid imageId, Guid recipeId, string objectKey, CancellationToken ct);
}
