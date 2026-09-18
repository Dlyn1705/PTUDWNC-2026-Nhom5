namespace CulinaryBlog.Domain.Enums;

public enum RecipeDifficulty : short
{
    Easy = 1,
    Medium = 2,
    Hard = 3,
    Expert = 4
}

public enum RecipeStatus : short
{
    Draft = 0,
    Published = 1,
    Archived = 2
}
