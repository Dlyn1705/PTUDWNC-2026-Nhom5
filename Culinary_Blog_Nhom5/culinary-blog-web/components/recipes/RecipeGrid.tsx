import React from "react";
import { RecipeCardDto } from "@/types/recipe.types";
import { RecipeCard } from "./RecipeCard";
import { ChefHat } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/common/Skeleton";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";

interface RecipeGridProps {
  recipes: RecipeCardDto[];
  isLoading?: boolean;
  emptyMessage?: string;
  viewMode?: "grid" | "list";
}

export function RecipeGrid({
  recipes,
  isLoading = false,
  emptyMessage = "Không có công thức nào phù hợp với bộ lọc đã chọn.",
  viewMode = "grid",
}: RecipeGridProps) {
  const isList = viewMode === "list";

  if (isLoading) {
    return (
      <LoadingState label="Đang tải danh sách công thức…">
        <div
          className={cn(
            "grid gap-6",
            isList ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3",
          )}
        >
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className={cn(
                "overflow-hidden rounded-2xl border border-border bg-card shadow-soft",
                isList && "flex flex-col md:flex-row",
              )}
            >
              <Skeleton
                className={cn(
                  isList ? "aspect-[16/9] sm:w-64 sm:shrink-0 rounded-none" : "aspect-[16/9] w-full rounded-none",
                )}
              />
              <div className="space-y-3 p-5 sm:p-6 flex-1">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="border-t border-border pt-4 flex justify-between items-center">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </LoadingState>
    );
  }

  if (recipes.length === 0) {
    return (
      <EmptyState
        title="Chưa có công thức nào"
        description={emptyMessage}
        icon={<ChefHat className="size-7" />}
        className="my-8"
      />
    );
  }

  return (
    <div
      className={cn(
        "grid gap-6",
        isList ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} viewMode={viewMode} />
      ))}
    </div>
  );
}

export default RecipeGrid;
