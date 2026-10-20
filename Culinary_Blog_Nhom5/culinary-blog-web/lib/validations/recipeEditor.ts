import { z } from "zod";

const numberText = (label: string, min: number, max: number, precision = 0, optional = false) =>
  z.string().trim().refine(value => {
    if (optional && !value) return true;
    const parsed = Number(value);
    const scale = 10 ** precision;
    return Number.isFinite(parsed) && parsed >= min && parsed <= max &&
      Math.abs(parsed * scale - Math.round(parsed * scale)) < 0.000001;
  }, `${label}: nhập số từ ${min} đến ${max}${precision ? `, tối đa ${precision} chữ số thập phân` : " và không có phần thập phân"}.`);

export const recipeEditorSchema = z.object({
  title: z.string().trim().min(3, "Tên công thức phải từ 3 đến 200 ký tự.").max(200, "Tên công thức tối đa 200 ký tự."),
  description: z.string().trim().max(2000, "Mô tả tối đa 2000 ký tự."),
  instructions: z.string().trim().max(10000, "Hướng dẫn tối đa 10000 ký tự."),
  categoryId: z.string().uuid("Vui lòng chọn danh mục.").refine(value => value !== "00000000-0000-0000-0000-000000000000", "Vui lòng chọn danh mục."),
  difficulty: z.enum(["1", "2", "3", "4"], { message: "Độ khó không hợp lệ." }),
  prepTime: numberText("Thời gian chuẩn bị", 0, 2147483647),
  cookTime: numberText("Thời gian nấu", 0, 2147483647),
  servings: numberText("Khẩu phần", 1, 2147483647),
  calories: numberText("Calories", 0, 999999.99, 2, true),
  protein: numberText("Protein", 0, 999999.99, 2, true),
  carbohydrates: numberText("Carbohydrates", 0, 999999.99, 2, true),
  fat: numberText("Chất béo", 0, 999999.99, 2, true),
  fiber: numberText("Chất xơ", 0, 999999.99, 2, true),
  sodium: numberText("Natri", 0, 999999.99, 2, true),
});
export type RecipeEditorValues = z.infer<typeof recipeEditorSchema>;
export type RecipeEditorField = keyof RecipeEditorValues;
export const emptyRecipeEditor: RecipeEditorValues = {
  title: "", description: "", instructions: "", categoryId: "", difficulty: "1", prepTime: "", cookTime: "", servings: "",
  calories: "", protein: "", carbohydrates: "", fat: "", fiber: "", sodium: "",
};
export const nutritionFields = ["calories", "protein", "carbohydrates", "fat", "fiber", "sodium"] as const;

/** Match only editable fields; nested collection/unknown errors stay in the summary. */
export function recipeErrorField(key: string): RecipeEditorField | undefined {
  const normalized = key.replace(/^\$\.?/, "").replace(/^(request|recipe|command)\./i, "").toLowerCase();
  const candidate = normalized.replace(/^nutrition\./, "");
  const aliases: Record<string, RecipeEditorField> = {
    title: "title", description: "description", instructions: "instructions", category: "categoryId", categoryid: "categoryId",
    difficulty: "difficulty", preptime: "prepTime", preptimeminutes: "prepTime", cooktime: "cookTime", cooktimeminutes: "cookTime",
    servings: "servings", calories: "calories", protein: "protein", carbohydrates: "carbohydrates", carbs: "carbohydrates",
    fat: "fat", fiber: "fiber", sodium: "sodium",
  };
  if (!Object.hasOwn(aliases, candidate)) return undefined;
  const field = aliases[candidate];
  if (normalized.startsWith("nutrition.") && !nutritionFields.includes(field as typeof nutritionFields[number])) return undefined;
  return field;
}

/** A safe client-side validation message from the ingredient/step form. */
export class RecipeFormValidationError extends Error {}
export type RecipeCollectionValidation = {
  validate: () => Promise<boolean>;
  setServerErrors: (errors: Record<string, string[]>, focus?: boolean) => number;
};
export function collectionFieldErrors<T extends string>(errors: Record<string, string[]>, collection: "ingredients" | "steps", size: number, fields: readonly T[]) {
  const result: { index: number; field: T; message: string }[] = [];
  const pattern = new RegExp(`^${collection}(?:\\[(\\d+)\\]|\\.(\\d+))\\.(\\w+)$`, "i");
  for (const [key, messages] of Object.entries(errors)) {
    const match = key.replace(/^\$\.?/, "").replace(/^(request|recipe|command)\./i, "").match(pattern);
    if (!match || !messages.length) continue;
    const index = Number(match[1] ?? match[2]);
    const field = fields.find(candidate => candidate.toLowerCase() === match[3].toLowerCase());
    if (field && index >= 0 && index < size) result.push({ index, field, message: messages.join(" ") });
  }
  return result;
}
