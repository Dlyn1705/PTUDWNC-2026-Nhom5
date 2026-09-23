import React from "react";
import Link from "next/link";
import { Clock, Flame, Users, ChefHat } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { difficultyLabel, type RecipeDto, type DifficultyValue } from "@/types/recipe.types";
import { cn } from "@/lib/utils";

interface RecipeCardProps {
  recipe: RecipeDto;
  viewMode?: "grid" | "list";
  showStatusBadge?: boolean;
}

export function DifficultyBadge({ difficulty }: { difficulty: DifficultyValue }) {
  const styles: Record<DifficultyValue, string> = {
    1: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800",
    2: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",
    3: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800",
    4: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide shadow-2xs backdrop-blur-xs",
        styles[difficulty] || styles[1]
      )}
    >
      <Flame className="size-3" />
      {difficultyLabel[difficulty] || "Easy"}
    </span>
  );
}

export function RecipeCard({
  recipe,
  viewMode = "grid",
  showStatusBadge = false,
}: RecipeCardProps) {
  const image = recipe.images?.find((i) => i.isPrimary) ?? recipe.images?.[0];
  const totalMinutes = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const isList = viewMode === "list";

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:shadow-lift hover:-translate-y-0.5",
        isList && "flex flex-col sm:flex-row items-stretch"
      )}
    >
      <Link
        href={`/recipes/${recipe.slug}`}
        className={cn("block w-full", isList && "flex flex-col sm:flex-row w-full")}
      >
        {/* Thumbnail (16:9 standard ratio) */}
        <div
          className={cn(
            "relative overflow-hidden bg-muted",
            isList
              ? "aspect-[16/9] sm:aspect-square sm:w-64 sm:shrink-0"
              : "aspect-[16/9] w-full"
          )}
        >
          {image ? (
            <img
              src={image.url}
              alt={image.alt || recipe.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/50 bg-secondary/50">
              <ChefHat className="size-10" />
            </div>
          )}

          {/* Difficulty Badge on Image Top-Left */}
          <div className="absolute left-3 top-3 flex items-center gap-1.5 z-10">
            <DifficultyBadge difficulty={recipe.difficulty} />
            {showStatusBadge && recipe.status !== 1 && (
              <StatusBadge status={recipe.status} />
            )}
          </div>
        </div>

        {/* Card Body */}
        <div
          className={cn(
            "flex flex-1 flex-col justify-between p-5 sm:p-6",
            isList && "p-6"
          )}
        >
          <div className="space-y-2.5">
            {recipe.categoryName && (
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {recipe.categoryName}
              </p>
            )}

            <h3 className="font-display text-xl sm:text-2xl font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {recipe.title}
            </h3>

            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {recipe.description}
            </p>
          </div>

          {/* Card Footer: Author + Cook Stats */}
          <div className="mt-5 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            {/* Author Avatar & Name */}
            {recipe.author && (
              <div className="flex items-center gap-2">
                {recipe.author.avatarUrl ? (
                  <img
                    src={recipe.author.avatarUrl}
                    alt={recipe.author.displayName}
                    className="size-6 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
                    {recipe.author.displayName?.charAt(0) || "C"}
                  </div>
                )}
                <span className="font-medium text-foreground/90 truncate max-w-[120px]">
                  {recipe.author.displayName}
                </span>
              </div>
            )}

            {/* Quick Metrics */}
            <div className="flex items-center gap-3.5 tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5 text-primary" /> {totalMinutes}m
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5 text-primary" /> {recipe.servings}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}

export default RecipeCard;
