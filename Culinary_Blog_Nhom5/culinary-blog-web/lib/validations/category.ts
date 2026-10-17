import { z } from "zod";

const optionalHttpUrl = z
  .string()
  .trim()
  .max(500, "URL ảnh không được vượt quá 500 ký tự.")
  .refine((value) => {
    if (!value) return true;

    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "URL ảnh phải là địa chỉ HTTP hoặc HTTPS hợp lệ.");

export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Tên danh mục phải có ít nhất 2 ký tự.")
    .max(100, "Tên danh mục không được vượt quá 100 ký tự."),
  description: z.string().trim(),
  imageUrl: optionalHttpUrl,
  orderIndex: z
    .number({ invalid_type_error: "Thứ tự hiển thị phải là một số." })
    .int("Thứ tự hiển thị phải là số nguyên.")
    .min(0, "Thứ tự hiển thị phải lớn hơn hoặc bằng 0."),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
