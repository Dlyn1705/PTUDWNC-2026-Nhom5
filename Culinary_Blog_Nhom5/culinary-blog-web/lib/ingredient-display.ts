// Display helpers intentionally have no form-validation dependency.
export function formatIngredientQuantity(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumSignificantDigits: 12 }).format(value);
}

export function ingredientStructuredText(item: { name: string; quantity?: number | null; unit?: string | null; notes?: string | null }): string {
  return [item.quantity == null ? null : String(item.quantity), item.unit?.trim(), item.name.trim(),
    item.notes?.trim() ? `(${item.notes.trim()})` : null].filter(Boolean).join(" ");
}
