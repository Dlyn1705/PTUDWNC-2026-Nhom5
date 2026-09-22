import React from "react";
import { RecipeNutritionDto } from "@/types/recipe.types";

interface NutritionCardProps {
  nutrition: RecipeNutritionDto;
}

export function NutritionCard({ nutrition }: NutritionCardProps) {
  const metrics = [
    { label: "Calories", value: nutrition.calories, unit: "kcal", max: 900, color: "bg-primary" },
    { label: "Protein", value: nutrition.protein, unit: "g", max: 60, color: "bg-amber-500" },
    { label: "Carbohydrates", value: nutrition.carbs, unit: "g", max: 120, color: "bg-orange-500" },
    { label: "Fat", value: nutrition.fat, unit: "g", max: 60, color: "bg-rose-500" },
    { label: "Fiber", value: nutrition.fiber ?? 0, unit: "g", max: 35, color: "bg-emerald-500" },
    { label: "Sodium", value: nutrition.sodium, unit: "mg", max: 1500, color: "bg-blue-500" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Nutrition per serving
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estimates based on recipe ingredients (6 core indicators).
          </p>
        </div>
        <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
          {nutrition.calories} kcal
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {metrics.map((item) => {
          const percentage = Math.min(100, Math.round((item.value / item.max) * 100));
          return (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">{item.label}</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {item.value} {item.unit}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default NutritionCard;
