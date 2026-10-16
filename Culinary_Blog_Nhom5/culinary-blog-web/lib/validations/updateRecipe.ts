import type { RecipeWritePayload } from "@/types/recipe.types";

export function validateRecipeUpdate(value: RecipeWritePayload): RecipeWritePayload {
  const title = value.title.trim();
  const description = value.description?.trim() ?? "";
  const instructions = value.instructions?.trim() ?? "";
  if (title.length < 3 || title.length > 200) throw new Error("Tên công thức phải từ 3 đến 200 ký tự.");
  if (description.length > 2000) throw new Error("Mô tả tối đa 2000 ký tự.");
  if (instructions.length > 10000) throw new Error("Hướng dẫn tối đa 10000 ký tự.");
  if (![1, 2, 3, 4].includes(value.difficulty)) throw new Error("Độ khó không hợp lệ.");
  for (const key of ["prepTime", "cookTime", "servings"] as const) {
    const min = key === "servings" ? 1 : 0;
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > 2147483647)
      throw new Error(`${{ prepTime: "Thời gian chuẩn bị", cookTime: "Thời gian nấu", servings: "Khẩu phần" }[key]}: nhập số nguyên từ ${min} đến 2147483647.`);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.categoryId) ||
      value.categoryId === "00000000-0000-0000-0000-000000000000") throw new Error("Vui lòng chọn danh mục.");
  if (!value.rowVersion) throw new Error("Thiếu phiên bản công thức. Hãy tải lại trước khi lưu.");
  return { ...value, title, description, instructions };
}
