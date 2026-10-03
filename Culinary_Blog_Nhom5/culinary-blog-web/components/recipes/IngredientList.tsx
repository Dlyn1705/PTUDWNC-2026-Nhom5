"use client";

import React, { useState } from "react";
import { Minus, Plus, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecipeIngredientDto } from "@/types/recipe.types";
import { cn } from "@/lib/utils";

interface IngredientListProps {
  ingredients: RecipeIngredientDto[];
  baseServings: number;
}

function formatQuantity(num: number): string {
  const rounded = Math.round(num * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function IngredientList({
  ingredients,
  baseServings,
}: IngredientListProps) {
  const [servings, setServings] = useState(baseServings || 4);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const scale = baseServings > 0 ? servings / baseServings : 1;
  const checkedCount = Object.values(checked).filter(Boolean).length;

  const toggleCheck = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clearAllChecks = () => {
    setChecked({});
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      {/* Header with Servings Scaler */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h3 className="font-display text-xl font-semibold text-foreground">
            Ingredients
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {checkedCount > 0 ? (
              <span className="text-primary font-medium">
                {checkedCount} of {ingredients.length} items checked
              </span>
            ) : (
              "Click items to check off while shopping or cooking"
            )}
          </p>
        </div>

        {/* Servings Adjuster */}
        <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-sm shadow-2xs">
          <span className="text-xs font-medium text-muted-foreground mr-1">Servings</span>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 rounded-full hover:bg-accent"
            disabled={servings <= 1}
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            title="Decrease servings"
          >
            <Minus className="size-3" />
          </Button>
          <span className="min-w-[1.5rem] text-center font-bold tabular-nums text-foreground">
            {servings}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-6 rounded-full hover:bg-accent"
            onClick={() => setServings((s) => s + 1)}
            title="Increase servings"
          >
            <Plus className="size-3" />
          </Button>
        </div>
      </div>

      {/* Quick Action Bar if items are checked */}
      {checkedCount > 0 && (
        <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
          <span className="font-medium text-herb flex items-center gap-1">
            <Check className="size-3.5" />
            {Math.round((checkedCount / ingredients.length) * 100)}% prepared
          </span>
          <button
            onClick={clearAllChecks}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer"
          >
            <RotateCcw className="size-3" /> Clear checks
          </button>
        </div>
      )}

      {/* Ingredient Items */}
      <ul className="mt-3 divide-y divide-border/60">
        {ingredients.map((item) => {
          const isChecked = !!checked[item.id];
          const hasQuantity = item.quantity !== null && item.quantity !== undefined;
          const scaledQuantity = hasQuantity ? formatQuantity((item.quantity as number) * scale) : "";
          const hasUnit = Boolean(item.unit && item.unit.trim());

          return (
            <li
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              className={cn(
                "flex items-start gap-3 py-3 text-sm cursor-pointer select-none transition-colors -mx-2 px-2 rounded-lg",
                isChecked ? "bg-muted/30 text-muted-foreground" : "hover:bg-accent/40"
              )}
            >
              <div className="pt-0.5 pointer-events-none">
                <span
                  className={cn(
                    "flex size-4.5 items-center justify-center rounded border transition-colors",
                    isChecked
                      ? "border-herb bg-herb text-herb-foreground"
                      : "border-muted-foreground/40 bg-background"
                  )}
                >
                  {isChecked && <Check className="size-3 stroke-[3]" />}
                </span>
              </div>

              <div className="flex-1">
                <span
                  className={cn(
                    "font-medium transition-colors",
                    isChecked ? "line-through text-muted-foreground" : "text-foreground"
                  )}
                >
                  {(scaledQuantity || hasUnit) && (
                    <span className="font-semibold tabular-nums text-primary mr-1.5">
                      {scaledQuantity}
                      {hasUnit ? (scaledQuantity ? ` ${item.unit}` : item.unit) : ""}
                    </span>
                  )}
                  {item.name}
                </span>

                {item.notes && (
                  <span className="block text-xs text-muted-foreground italic mt-0.5">
                    ({item.notes})
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default IngredientList;
