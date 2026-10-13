"use client";

import React, { useState, useTransition } from "react";
import { LayoutGrid, List, SlidersHorizontal, ArrowUpDown, X } from "lucide-react";
import type { RecipeSummaryDto } from "@/types/recipe.types";
import { CategoryDto } from "@/types/category.types";
import { RecipeGrid } from "./RecipeGrid";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import type { PaginationMeta } from "@/types/api.types";

interface RecipesCatalogViewProps {
  initialRecipes: RecipeSummaryDto[];
  categories: CategoryDto[];
  meta: PaginationMeta;
  totalPublished: number;
  selectedCategory: string;
  selectedDifficulty: string;
  sortBy: "newest" | "time" | "title";
}

export function RecipesCatalogView({
  initialRecipes,
  categories, meta, totalPublished, selectedCategory, selectedDifficulty, sortBy,
}: RecipesCatalogViewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateQuery(changes: Record<string, string>) {
    const query = new URLSearchParams(searchParams.toString());
    query.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value === "all" || value === "newest") query.delete(key);
      else query.set(key, value);
    }
    startTransition(() => router.push(`/recipes${query.size ? `?${query}` : ""}`, { scroll: false }));
  }

  const activeFiltersCount =
    (selectedCategory !== "all" ? 1 : 0) + (selectedDifficulty !== "all" ? 1 : 0);
  const resetFilters = () => updateQuery({ categoryId: "all", difficulty: "all", sort: "newest" });

  return (
    <div className="space-y-8" aria-busy={isPending}>
      {/* Filter and View Mode Toolbar */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-soft space-y-4">
        {/* Top row: Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => updateQuery({ categoryId: "all" })}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
              selectedCategory === "all"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            All Categories ({totalPublished})
          </button>

          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => updateQuery({ categoryId: c.id })}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
                selectedCategory === c.id
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Bottom row: Difficulty Filter, Sort Dropdown & Grid/List View Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-border text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Difficulty Filter */}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <SlidersHorizontal className="size-3.5 text-primary" />
              <label htmlFor="catalog-difficulty">Difficulty:</label>
              <select
                id="catalog-difficulty"
                value={selectedDifficulty}
                onChange={(e) => updateQuery({ difficulty: e.target.value })}
                className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">Any Difficulty</option>
                <option value="1">Easy (Dễ)</option>
                <option value="2">Medium (Trung bình)</option>
                <option value="3">Hard (Khó)</option>
                <option value="4">Expert (Chuyên gia)</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ArrowUpDown className="size-3.5 text-primary" />
              <label htmlFor="catalog-sort">Sort:</label>
              <select
                id="catalog-sort"
                value={sortBy}
                onChange={(e) => updateQuery({ sort: e.target.value })}
                className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="newest">Newest First</option>
                <option value="time">Quickest Cook Time</option>
                <option value="title">Title (A-Z)</option>
              </select>
            </div>

            {activeFiltersCount > 0 && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
              >
                <X className="size-3" /> Reset
              </button>
            )}
          </div>

          {/* Grid / List View Toggle */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border">
            <Button
              size="sm"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              className={cn(
                "size-8 p-0 rounded-lg transition-all",
                viewMode === "grid" && "bg-background text-foreground shadow-2xs font-semibold"
              )}
              onClick={() => setViewMode("grid")}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid className="size-4" />
            </Button>

            <Button
              size="sm"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              className={cn(
                "size-8 p-0 rounded-lg transition-all",
                viewMode === "list" && "bg-background text-foreground shadow-2xs font-semibold"
              )}
              onClick={() => setViewMode("list")}
              title="List view"
              aria-label="List view"
            >
              <List className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Results Count Strip */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Hiển thị <strong className="text-foreground">{initialRecipes.length ? (meta.page - 1) * meta.pageSize + 1 : 0}–{initialRecipes.length ? (meta.page - 1) * meta.pageSize + initialRecipes.length : 0}</strong> / {meta.totalCount} công thức
          {selectedCategory !== "all" && " in selected category"}
        </span>

        <span className="tabular-nums">
          View Mode: <span className="font-semibold text-foreground capitalize">{viewMode}</span>
        </span>
      </div>

      {/* Recipe Grid / List */}
      <RecipeGrid
        recipes={initialRecipes}
        isLoading={isPending}
        viewMode={viewMode}
        emptyMessage="No recipes found matching your selected filters. Try choosing 'All Categories' or resetting difficulty."
      />
      {meta.totalPages > 1 && (
        <nav aria-label="Recipe pagination" className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" disabled={isPending || !meta.hasPreviousPage} onClick={() => updateQuery({ page: String(meta.page - 1) })}>Trang trước</Button>
          {Array.from({ length: meta.totalPages }, (_, index) => index + 1)
            .filter((page) => meta.totalPages <= 10 || page === 1 || page === meta.totalPages || Math.abs(page - meta.page) <= 2)
            .map((page, index, pages) => (
              <React.Fragment key={page}>
                {index > 0 && page - pages[index - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
                <Button variant={page === meta.page ? "default" : "outline"} disabled={isPending} aria-current={page === meta.page ? "page" : undefined} aria-label={`Page ${page}`} onClick={() => updateQuery({ page: String(page) })}>{page}</Button>
              </React.Fragment>
            ))}
          <Button variant="outline" disabled={isPending || !meta.hasNextPage} onClick={() => updateQuery({ page: String(meta.page + 1) })}>Trang sau</Button>
        </nav>
      )}
      <p role="status" className="sr-only">{isPending ? "Loading recipes" : `${meta.totalCount} recipes, page ${meta.page} of ${Math.max(1, meta.totalPages)}`}</p>
    </div>
  );
}

export default RecipesCatalogView;
