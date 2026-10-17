import React from "react";
import { RecipeCardDto } from "@/types/recipe.types";
import { RecipeCard } from "./RecipeCard";
import { ChefHat } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecipeGridProps {
  recipes: RecipeCardDto[];
  isLoading?: boolean;
  emptyMessage?: string;
  viewMode?: "grid" | "list";
}

export function RecipeGrid({
  recipes,
  isLoading = false,
  emptyMessage = "No recipes found in this collection.",
  viewMode = "grid",
}: RecipeGridProps) {
  const isList = viewMode === "list";

  if (isLoading) {
    return (
      <div
        className={cn(
          "grid gap-6",
          isList ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"
        )}
      >
        {[1, 2, 3, 4, 5, 6].map((idx) => (
          <div
            key={idx}
            className={cn(
              "overflow-hidden rounded-2xl border border-border bg-card shadow-soft animate-pulse",
              isList && "flex flex-col sm:flex-row"
            )}
          >
            <div
              className={cn(
                "bg-muted",
                isList ? "aspect-[16/9] sm:w-64 sm:shrink-0" : "aspect-[16/9] w-full"
              )}
            />
            <div className="space-y-3 p-5 sm:p-6 flex-1">
              <div className="h-3.5 w-20 rounded bg-muted" />
              <div className="h-6 w-3/4 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="border-t border-border pt-4 flex justify-between items-center">
                <div className="h-5 w-24 rounded-full bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft my-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
          <ChefHat className="size-6" />
        </div>
        <h3 className="font-display text-xl font-semibold text-foreground">
          No recipes found
        </h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-6",
        isList ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"
      )}
    >
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} viewMode={viewMode} />
      ))}
    </div>
  );
}

export default RecipeGrid;
