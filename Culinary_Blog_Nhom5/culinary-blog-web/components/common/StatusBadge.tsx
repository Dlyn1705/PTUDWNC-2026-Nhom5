import React from "react";
import { cn } from "@/lib/utils";
import { statusLabel, type RecipeStatusValue } from "@/types/recipe.types";

const styles: Record<RecipeStatusValue, string> = {
  0: "bg-draft text-draft-foreground border-border",
  1: "bg-published text-published-foreground border-transparent",
  2: "bg-archived text-archived-foreground border-transparent",
};

export function StatusBadge({
  status,
  className,
}: {
  status: RecipeStatusValue;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide border shadow-2xs",
        styles[status],
        className,
      )}
    >
      {statusLabel[status]}
    </span>
  );
}
