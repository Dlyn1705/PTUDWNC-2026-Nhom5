"use client";

import { useFormContext } from "react-hook-form";
import type { RecipeFormValues } from "@/lib/validations/recipe";

const fields = [
  ["calories", "Calories", "kcal"], ["protein", "Protein", "g"],
  ["carbohydrates", "Carbohydrates", "g"], ["fat", "Chất béo", "g"],
  ["fiber", "Chất xơ", "g"], ["sodium", "Natri", "mg"],
] as const;

export function NutritionFields() {
  const { register } = useFormContext<RecipeFormValues>();
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <h2 className="font-display text-xl font-semibold">Thông tin dinh dưỡng</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([name, label, unit]) => (
          <label key={name} className="text-sm font-medium">{label}
            <div className="relative mt-2">
              <input type="number" min={0} step="any" {...register(`nutrition.${name}`, { setValueAs: (value) => value === "" ? null : Number(value) })} className="w-full rounded-xl border border-input bg-background px-4 py-3 pr-14" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}
