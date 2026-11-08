import { z } from "zod";

const optionalNumber = z.number().min(0, "Giá trị không được âm").nullable();

export const recipeFormSchema = z.object({
  title: z.string().trim().min(3, "Tên món ăn cần ít nhất 3 ký tự").max(200),
  description: z.string().trim().max(2000),
  categoryId: z.string().uuid("Vui lòng chọn danh mục"),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  prepTime: z.number().int().min(0),
  cookTime: z.number().int().min(0),
  servings: z.number().int().min(1, "Số khẩu phần phải lớn hơn 0"),
  nutrition: z.object({
    calories: optionalNumber,
    protein: optionalNumber,
    carbohydrates: optionalNumber,
    fat: optionalNumber,
    fiber: optionalNumber,
    sodium: optionalNumber,
  }),
  ingredients: z.array(z.object({
    name: z.string().trim().min(1, "Tên nguyên liệu là bắt buộc"),
    quantity: optionalNumber,
    unit: z.string().trim().max(50),
    notes: z.string().trim().max(300),
  })).min(1, "Cần ít nhất một nguyên liệu").max(100),
  steps: z.array(z.object({
    title: z.string().trim().max(150),
    description: z.string().trim().min(1, "Nội dung bước là bắt buộc"),
    timerMinutes: optionalNumber,
  })).min(1, "Cần ít nhất một bước thực hiện").max(100),
});

export type RecipeFormValues = z.infer<typeof recipeFormSchema>;
