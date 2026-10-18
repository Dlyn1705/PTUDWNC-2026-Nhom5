import { z } from "zod";

export const ingredientDraftSchema = z.object({
  ingredientId: z.string().optional(),
  name: z.string().trim().min(1, "Nhập tên nguyên liệu.").max(200, "Tên tối đa 200 ký tự."),
  quantity: z.string().refine(value => {
    if (!value.trim()) return true;
    if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return false;
    if ((value.trim().split(/[.,]/)[1] ?? "").replace(/0+$/, "").length > 3) return false;
    const number = Number(value.replace(",", "."));
    return Number.isFinite(number) && number > 0 && number <= 9999999.999;
  }, "Nhập số lớn hơn 0, tối đa 9999999.999 và tối đa 3 chữ số thập phân."),
  unit: z.string().trim().max(50, "Đơn vị tối đa 50 ký tự."),
  notes: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự."),
});

export const ingredientFormSchema = z.object({ items: z.array(ingredientDraftSchema).max(100, "Tối đa 100 nguyên liệu.") });
export type IngredientDraft = z.infer<typeof ingredientDraftSchema>;
export const emptyIngredient = (): IngredientDraft => ({ name: "", quantity: "", unit: "", notes: "" });
export function ingredientPayload(draft: IngredientDraft) {
  const item = ingredientDraftSchema.parse(draft);
  return { name: item.name, quantity: item.quantity.trim() ? Number(item.quantity.replace(",", ".")) : null,
    unit: item.unit || null, notes: item.notes || null };
}

export function formatIngredientQuantity(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumSignificantDigits: 12 }).format(value);
}

export function ingredientStructuredText(item: { name: string; quantity?: number | null; unit?: string | null; notes?: string | null }): string {
  return [item.quantity == null ? null : String(item.quantity), item.unit?.trim(), item.name.trim(),
    item.notes?.trim() ? `(${item.notes.trim()})` : null].filter(Boolean).join(" ");
}
