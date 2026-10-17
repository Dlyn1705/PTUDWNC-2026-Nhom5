import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyIngredient, ingredientDraftSchema, ingredientFormSchema, ingredientPayload, formatIngredientQuantity, ingredientStructuredText } from "../lib/ingredient-form";

test("optional quantity/unit stay null, notes are normalized", () => {
  assert.deepEqual(ingredientPayload({ ...emptyIngredient(), name: " Muối ", notes: " Vừa đủ " }),
    { name: "Muối", quantity: null, unit: null, notes: "Vừa đủ" });
});
test("fractional quantity supports dot/comma and trailing zeroes", () => {
  for (const quantity of ["0.001", "0,001", "1.2340", "9999999.999"]) {
    assert.equal(ingredientDraftSchema.safeParse({ ...emptyIngredient(), name: "A", quantity }).success, true);
  }
  assert.equal(ingredientPayload({ ...emptyIngredient(), name: "A", quantity: "1,5" }).quantity, 1.5);
});
test("invalid/zero/overflow/rounded quantities cannot be submitted", () => {
  for (const quantity of ["0", "-1", "0.0001", "NaN", "Infinity", "10000000", "1e3", "1,234.5"]) {
    assert.equal(ingredientDraftSchema.safeParse({ ...emptyIngredient(), name: "A", quantity }).success, false, quantity);
  }
});
test("text limits match the backend, empty list is allowed", () => {
  const input = { ...emptyIngredient(), name: "A".repeat(200), unit: "g".repeat(50), notes: "n".repeat(500) };
  assert.equal(ingredientDraftSchema.safeParse(input).success, true);
  assert.equal(ingredientDraftSchema.safeParse({ ...input, name: "A".repeat(201) }).success, false);
  assert.equal(ingredientDraftSchema.safeParse({ ...input, unit: "g".repeat(51) }).success, false);
  assert.equal(ingredientDraftSchema.safeParse({ ...input, notes: "n".repeat(501) }).success, false);
  assert.equal(ingredientFormSchema.safeParse({ items: [] }).success, true);
  assert.equal(ingredientFormSchema.safeParse({ items: Array(101).fill(input) }).success, false);
});
test("small quantities do not round to zero when scaling servings", () => {
  assert.equal(formatIngredientQuantity(0.001), "0,001");
  assert.equal(formatIngredientQuantity(0.001 / 4), "0,00025");
});
test("JSON-LD never includes literal null/undefined for optional fields", () => {
  assert.equal(ingredientStructuredText({ name: "Muối", quantity: null, unit: null, notes: "Vừa đủ" }), "Muối (Vừa đủ)");
  assert.equal(ingredientStructuredText({ name: "Tiêu" }), "Tiêu");
  assert.equal(ingredientStructuredText({ name: "Gia vị", quantity: 0.001, unit: "g" }), "0.001 g Gia vị");
});
