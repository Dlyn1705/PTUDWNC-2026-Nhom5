"use client";

import React, { useState, useMemo } from "react";
import { LayoutGrid, List, SlidersHorizontal, ArrowUpDown, X } from "lucide-react";
import { RecipeDto } from "@/types/recipe.types";
import { CategoryDto } from "@/types/category.types";
import { RecipeGrid } from "./RecipeGrid";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RecipesCatalogViewProps {
  initialRecipes: RecipeDto[];
  categories: CategoryDto[];
}

export function RecipesCatalogView({
  initialRecipes,
  categories,
}: RecipesCatalogViewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "time" | "title">("newest");

  const filteredRecipes = useMemo(() => {
    let result = [...initialRecipes];

    if (selectedCategory !== "all") {
      result = result.filter(
        (r) =>
          r.categoryId === selectedCategory ||
          r.categoryName?.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    if (selectedDifficulty !== "all") {
      result = result.filter((r) => r.difficulty === Number(selectedDifficulty));
    }

    if (sortBy === "newest") {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "time") {
      result.sort(
        (a, b) =>
          (a.prepTimeMinutes + a.cookTimeMinutes) - (b.prepTimeMinutes + b.cookTimeMinutes)
      );
    } else if (sortBy === "title") {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  }, [initialRecipes, selectedCategory, selectedDifficulty, sortBy]);

  const activeFiltersCount =
    (selectedCategory !== "all" ? 1 : 0) + (selectedDifficulty !== "all" ? 1 : 0);

  const resetFilters = () => {
    setSelectedCategory("all");
    setSelectedDifficulty("all");
    setSortBy("newest");
  };

  return (
    <div className="space-y-8">
      {/* Filter and View Mode Toolbar */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-soft space-y-4">
        {/* Top row: Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory("all")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
              selectedCategory === "all"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            All Categories ({initialRecipes.length})
          </button>

          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
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
              <span>Difficulty:</span>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
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
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "newest" | "time" | "title")}
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
          Showing <strong className="text-foreground">{filteredRecipes.length}</strong> recipes
          {selectedCategory !== "all" && " in selected category"}
        </span>

        <span className="tabular-nums">
          View Mode: <span className="font-semibold text-foreground capitalize">{viewMode}</span>
        </span>
      </div>

      {/* Recipe Grid / List */}
      <RecipeGrid
        recipes={filteredRecipes}
        viewMode={viewMode}
        emptyMessage="No recipes found matching your selected filters. Try choosing 'All Categories' or resetting difficulty."
      />
    </div>
  );
}

export default RecipesCatalogView;
