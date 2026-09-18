namespace CulinaryBlog.Domain.Entities;

/// <summary>
/// Owned Entity: nhúng trực tiếp vào bảng Recipes với tiền tố Nutrition_
/// </summary>
public class RecipeNutrition
{
    public decimal? Calories { get; set; }
    public decimal? Protein { get; set; }
    public decimal? Carbohydrates { get; set; }
    public decimal? Fat { get; set; }
    public decimal? Fiber { get; set; }
    public decimal? Sodium { get; set; }

    public RecipeNutrition() { }

    public RecipeNutrition(decimal? calories, decimal? protein, decimal? carbs, decimal? fat, decimal? fiber, decimal? sodium)
    {
        Calories = calories;
        Protein = protein;
        Carbohydrates = carbs;
        Fat = fat;
        Fiber = fiber;
        Sodium = sodium;
    }
}
