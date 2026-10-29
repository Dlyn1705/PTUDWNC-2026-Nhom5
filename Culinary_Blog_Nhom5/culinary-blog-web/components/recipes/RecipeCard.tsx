import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ChefHat, Clock, Flame, Users } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import {
  difficultyLabel,
  type RecipeCardDto,
  type DifficultyValue,
} from "@/types/recipe.types";
import { cn } from "@/lib/utils";

export interface RecipeCardProps {
  recipe: RecipeCardDto;
  viewMode?: "grid" | "list";
  showStatusBadge?: boolean;
}

export function DifficultyBadge({
  difficulty,
}: {
  difficulty: DifficultyValue;
}) {
  const styles: Record<DifficultyValue, string> = {
    1: "bg-herb/15 text-herb border-herb/30",
    2: "bg-secondary text-secondary-foreground border-border",
    3: "bg-destructive/10 text-destructive border-destructive/30",
    4: "bg-primary/10 text-primary border-primary/30",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide shadow-2xs backdrop-blur-xs",
        styles[difficulty] || styles[1]
      )}
    >
      <Flame aria-hidden="true" className="size-3" />
      {difficultyLabel[difficulty] || "Dễ"}
    </span>
  );
}

export function RecipeCard({
  recipe,
  viewMode = "grid",
  showStatusBadge = false,
}: RecipeCardProps) {
  const image =
    recipe.images?.find((i) => i.isPrimary) ?? recipe.images?.[0];

  const totalMinutes =
    (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  const isList = viewMode === "list";

  return (
    <Card
      role="article"
      className={cn(
        "group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:shadow-lift hover:-translate-y-0.5",
        isList && "flex flex-col sm:flex-row items-stretch"
      )}
    >
      <Link
        href={`/recipes/${recipe.slug}`}
        className={cn(
          "block w-full",
          isList && "flex flex-col sm:flex-row w-full"
        )}
      >
        {/* Thumbnail */}
        <div
          className={cn(
            "relative overflow-hidden bg-muted",
            isList
              ? "aspect-[16/9] sm:aspect-square sm:w-64 sm:shrink-0"
              : "aspect-[16/9] w-full"
          )}
        >
          {image?.url ? <Image
            src={image.url}
            alt={image.alt || recipe.title}
            width={800}
            height={450}
            unoptimized
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out motion-reduce:transition-none group-hover:scale-[1.05] motion-reduce:group-hover:scale-100"
          /> : <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ChefHat aria-hidden="true" className="size-10 opacity-50" />
            <span className="sr-only">Công thức chưa có ảnh đại diện</span>
          </div>}

          {/* Difficulty Badge */}
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5">
            <DifficultyBadge difficulty={recipe.difficulty} />

            {showStatusBadge && recipe.status !== 1 && (
              <StatusBadge status={recipe.status} />
            )}
          </div>
        </div>

        {/* Card Body */}
        <CardContent
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

          {/* Card Footer */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
            {/* Author */}
            {recipe.author && (
              <div className="flex items-center gap-2">
                {recipe.author.avatarUrl ? (
                  <Image
                    src={recipe.author.avatarUrl}
                    alt={recipe.author.displayName}
                    width={24}
                    height={24}
                    unoptimized
                    className="size-6 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {recipe.author.displayName?.charAt(0) || "C"}
                  </div>
                )}

                <span className="max-w-[120px] truncate font-medium text-foreground/90">
                  {recipe.author.displayName}
                </span>
              </div>
            )}

            {/* Quick Metrics */}
            <div className="flex items-center gap-3.5 tabular-nums">
              <span className="inline-flex items-center gap-1" aria-label={`${totalMinutes} phút`}>
                <Clock aria-hidden="true" className="size-3.5 text-primary" />
                {totalMinutes} phút
              </span>

              <span className="inline-flex items-center gap-1" aria-label={`${recipe.servings} khẩu phần`}>
                <Users aria-hidden="true" className="size-3.5 text-primary" />
                {recipe.servings} phần
              </span>
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

export default RecipeCard;
