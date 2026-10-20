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
import { Pagination } from "@/components/common/Pagination";
import { getPaginationItems, buildPaginationLinks } from "@/lib/pagination";

interface RecipesCatalogViewProps {
  initialRecipes: RecipeSummaryDto[];
  categories: CategoryDto[];
  meta: PaginationMeta;
  totalPublished: number;
  selectedCategory: string;
  selectedDifficulty: string;
  sortBy: "createdAt" | "cookTime" | "title";
  sortOrder: "asc" | "desc";
}

export function RecipesCatalogView({
  initialRecipes,
  categories, meta, totalPublished, selectedCategory, selectedDifficulty, sortBy, sortOrder,
}: RecipesCatalogViewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateQuery(changes: Record<string, string>) {
    const query = new URLSearchParams(searchParams?.toString() ?? "");
    query.delete("page");
    query.delete("sort");
    for (const [key, value] of Object.entries(changes)) {
      if (value === "" || value === "all") query.delete(key);
      else query.set(key, value);
    }
    startTransition(() => router.push(`/recipes${query.size ? `?${query}` : ""}`, { scroll: false }));
  }

  const activeFiltersCount =
    (selectedCategory !== "all" ? 1 : 0) + (selectedDifficulty !== "all" ? 1 : 0);
  const resetFilters = () => updateQuery({ categoryId: "all", difficulty: "all", sortBy: "", sortOrder: "" });

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
                onChange={(e) => updateQuery({ sortBy: e.target.value, sortOrder: e.target.value === "createdAt" ? "desc" : "asc" })}
                className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="createdAt">Published date</option>
                <option value="cookTime">Cook time</option>
                <option value="title">Title</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <label htmlFor="catalog-sort-order">Order:</label>
              <select
                id="catalog-sort-order"
                value={sortOrder}
                onChange={(e) => updateQuery({ sortOrder: e.target.value })}
                className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
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
        <Pagination
          mode="link"
          page={meta.page}
          totalPages={meta.totalPages}
          disabled={isPending}
          links={buildPaginationLinks(
            getPaginationItems(meta.page, meta.totalPages),
            meta.page,
            meta.totalPages,
            (pageNumber) => {
              const query = new URLSearchParams(searchParams?.toString() ?? "");
              if (pageNumber === 1) query.delete("page");
              else query.set("page", String(pageNumber));
              return `/recipes${query.size ? `?${query}` : ""}`;
            },
          )}
          ariaLabel="Phân trang công thức"
        />
      )}
      <p role="status" className="sr-only">{isPending ? "Đang tải công thức" : `${meta.totalCount} recipes, page ${meta.page} of ${Math.max(1, meta.totalPages)}`}</p>
    </div>
  );
}

export default RecipesCatalogView;
