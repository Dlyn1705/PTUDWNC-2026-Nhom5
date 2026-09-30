import React from "react";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";

interface CategoryHeaderProps {
  totalCategories: number;
  totalRecipes: number;
}

export function CategoryHeader({
  totalCategories,
  totalRecipes,
}: CategoryHeaderProps) {
  return (
    <div className="pt-8 pb-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
        <Link href="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">Categories</span>
      </nav>

      {/* Header Content */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Explore
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-foreground">
            All categories
          </h1>
          <p className="mt-3 max-w-prose text-muted-foreground text-sm sm:text-base leading-relaxed">
            Every corner of the kitchen, organised. Pick a category to see its full recipe collection.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-soft">
          <UtensilsCrossed className="size-4 text-primary" />
          <span className="tabular-nums font-medium">
            {totalCategories} categories · {totalRecipes} recipes
          </span>
        </div>
      </div>
    </div>
  );
}

export default CategoryHeader;
