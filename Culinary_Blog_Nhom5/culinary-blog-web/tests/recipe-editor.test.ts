import assert from "node:assert/strict";
import { test } from "node:test";
import { recipeEditorSchema, emptyRecipeEditor, recipeErrorField, collectionFieldErrors } from "../lib/validations/recipeEditor";
import { buildCreateRecipePayload } from "../lib/validations/createRecipe";

const valid = { ...emptyRecipeEditor, title: "Cơm chiên", categoryId: "11111111-1111-4111-8111-111111111111", servings: "2" };
test("recipe editor trims text and accepts optional zero times and blank nutrition", () => {
  const parsed = recipeEditorSchema.parse({ ...valid, title: "  Cơm chiên  " });
  assert.equal(parsed.title, "Cơm chiên");
  assert.equal(parsed.prepTime, "");
});
test("recipe editor rejects whitespace title, invalid category, fractional time and invalid servings", () => {
  for (const value of [{ title: "   " }, { categoryId: "00000000-0000-0000-0000-000000000000" },
    { prepTime: "1.2" }, { cookTime: "-1" }, { servings: "" }, { servings: "2147483648" }])
    assert.equal(recipeEditorSchema.safeParse({ ...valid, ...value }).success, false, JSON.stringify(value));
});
test("recipe nutrition respects backend precision and numeric bounds", () => {
  assert.equal(recipeEditorSchema.safeParse({ ...valid, calories: "999999.99", fiber: "0.01" }).success, true);
  for (const fiber of ["-1", "0.001", "1000000", "not-a-number"])
    assert.equal(recipeEditorSchema.safeParse({ ...valid, fiber }).success, false);
});
test("validation keys map case and backend names without guessing nested collection fields", () => {
  assert.equal(recipeErrorField("Title"), "title");
  assert.equal(recipeErrorField("$.Recipe.PrepTimeMinutes"), "prepTime");
  assert.equal(recipeErrorField("Nutrition.Carbohydrates"), "carbohydrates");
  assert.equal(recipeErrorField("Ingredients[0].Name"), undefined);
  assert.equal(recipeErrorField("RowVersion"), undefined);
  assert.equal(recipeErrorField("constructor"), undefined);
  assert.equal(recipeErrorField("__proto__"), undefined);
  assert.equal(recipeErrorField("Nutrition.Title"), undefined);
});
test("collection errors map only known properties of existing rows", () => {
  const errors = { "Ingredients[0].Name": ["Tên bắt buộc"], "$.Ingredients.1.Quantity": ["Số lượng sai"],
    "Ingredients[99].Name": ["No row"], "Ingredients[0].Secret": ["Unknown"], "Steps[0].Description": ["Mô tả sai"] };
  assert.deepEqual(collectionFieldErrors(errors, "ingredients", 2, ["name", "quantity"] as const), [
    { index: 0, field: "name", message: "Tên bắt buộc" }, { index: 1, field: "quantity", message: "Số lượng sai" },
  ]);
  assert.deepEqual(collectionFieldErrors(errors, "steps", 1, ["description"] as const), [{ index: 0, field: "description", message: "Mô tả sai" }]);
});
test("create payload retains ingredient notes and accepts the manager decimal-comma format", () => {
  const payload = buildCreateRecipePayload({ ...valid, category: valid.categoryId, steps: [],
    ingredients: [{ name: "Bột", quantity: "1,25", unit: "kg", notes: "  Chọn loại mịn  " }],
    nutrition: { calories: "", protein: "", carbohydrates: "", fat: "", fiber: "", sodium: "" } });
  assert.equal(payload.ingredients[0].quantity, 1.25);
  assert.equal(payload.ingredients[0].notes, "Chọn loại mịn");
});
