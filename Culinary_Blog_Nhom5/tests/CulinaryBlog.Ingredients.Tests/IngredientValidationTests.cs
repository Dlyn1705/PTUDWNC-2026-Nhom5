using System.Globalization;
using CulinaryBlog.Application.Features.Recipes.Ingredients;
using CulinaryBlog.Domain.Entities;
using Xunit;

namespace CulinaryBlog.Ingredients.Tests;

public sealed class IngredientValidationTests
{
    [Theory]
    [InlineData(null, true)]
    [InlineData("0", false)]
    [InlineData("-1", false)]
    [InlineData("0.001", true)]
    [InlineData("0.0001", false)]
    [InlineData("1.5", true)]
    [InlineData("1.2340", true)]
    [InlineData("9999999.999", true)]
    [InlineData("10000000", false)]
    public void Quantity_matches_nullable_database_precision(string? quantity, bool valid)
    {
        var input = new IngredientInput("Muối", quantity is null ? null : decimal.Parse(quantity, CultureInfo.InvariantCulture));
        Assert.Equal(valid, new IngredientInputValidator().Validate(input).IsValid);
    }

    [Theory]
    [InlineData(0, 0, 0, false)]
    [InlineData(1, 0, 0, true)]
    [InlineData(200, 50, 500, true)]
    [InlineData(201, 0, 0, false)]
    [InlineData(1, 51, 0, false)]
    [InlineData(1, 0, 501, false)]
    public void Text_boundaries_are_consistent(int name, int unit, int notes, bool valid) =>
        Assert.Equal(valid, new IngredientInputValidator().Validate(new IngredientInput(new string('a', name),
            null, new string('u', unit), new string('n', notes))).IsValid);

    [Fact]
    public void Domain_normalizes_optional_strings_without_replacing_null_quantity()
    {
        var item = RecipeIngredient.Create(Guid.NewGuid(), "  Muối  ", null, " ", " Vừa đủ ");
        Assert.Equal("Muối", item.Name); Assert.Null(item.Quantity); Assert.Null(item.Unit); Assert.Equal("Vừa đủ", item.Notes);
        item.Update(" Tiêu ", 0.001m, " g ", " ");
        Assert.Equal("Tiêu", item.Name); Assert.Equal(0.001m, item.Quantity); Assert.Equal("g", item.Unit); Assert.Null(item.Notes);
    }
}
