import type { DifficultyValue } from "@/types/recipe.types";

export type RecipeDraftForm = {
  title: string; description: string; category: string; difficulty: string;
  prepTime: string; cookTime: string; servings: string;
  ingredients: { name: string; quantity: string; unit: string }[];
  steps: { description: string }[];
  nutrition: Record<"calories" | "protein" | "carbohydrates" | "fat" | "fiber" | "sodium", string>;
};

/** Blank placeholder rows are optional for Drafts; partially filled ingredients must be valid. */
export function buildCreateRecipePayload(form: RecipeDraftForm) {
  const text = (value: string, label: string, min: number, max: number) => {
    const result = value.trim();
    if (result.length < min || result.length > max)
      throw new Error(`${label}: độ dài phải từ ${min} đến ${max} ký tự.`);
    return result;
  };
  const number = (value: string, label: string, min: number, max: number, precision: number) => {
    const result = Number(value);
    const scale = 10 ** precision;
    if (!Number.isFinite(result) || result < min || result > max ||
      Math.abs(result * scale - Math.round(result * scale)) > 0.000001)
      throw new Error(`${label}: nhập số từ ${min} đến ${max}, tối đa ${precision} chữ số thập phân.`);
    return result;
  };
  const title = text(form.title, "Tên công thức", 3, 200);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(form.category) ||
    form.category === "00000000-0000-0000-0000-000000000000")
    throw new Error("Vui lòng chọn danh mục.");
  const difficulty = number(form.difficulty, "Độ khó", 1, 4, 0) as DifficultyValue;
  if (form.ingredients.length > 100 || form.steps.length > 100)
    throw new Error("Tối đa 100 nguyên liệu và 100 bước.");
  const ingredients = form.ingredients
    .filter(x => x.name.trim() || x.quantity.trim() || x.unit.trim())
    .map(x => ({
      name: text(x.name, "Tên nguyên liệu", 1, 200),
      quantity: x.quantity.trim() ? number(x.quantity, "Số lượng", 0.001, 9999999.999, 3) : null,
      unit: text(x.unit, "Đơn vị", 0, 50) || null,
    }));
  const steps = form.steps.filter(x => x.description.trim()).map((x, i) => ({
    title: `Bước ${i + 1}`, description: text(x.description, "Nội dung bước", 1, 2000),
  }));
  const nutrition = Object.fromEntries(Object.entries(form.nutrition).map(([key, value]) =>
    [key, value.trim() ? number(value, `Dinh dưỡng (${key})`, 0, 999999.99, 2) : null]));
  return {
    title, description: text(form.description, "Mô tả", 0, 2000),
    // Structured steps are authoritative. Do not duplicate them into the legacy 10,000-character field.
    instructions: "", categoryId: form.category, difficulty,
    prepTime: number(form.prepTime, "Thời gian chuẩn bị", 0, 2147483647, 0),
    cookTime: number(form.cookTime, "Thời gian nấu", 0, 2147483647, 0),
    servings: number(form.servings, "Khẩu phần", 1, 2147483647, 0),
    ingredients, steps, nutrition,
  };
}
