"use client";

import React, { useState, useMemo } from "react";
import { CategoryDto } from "@/types/category.types";
import CategoryCard from "./CategoryCard";
import { UtensilsCrossed, Search, ArrowUpDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CategoryGridProps {
  categories: CategoryDto[];
  isLoading?: boolean;
}

export function CategoryGrid({
  categories,
  isLoading = false,
}: CategoryGridProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"count" | "name" | "time">("count");

  const filtered = useMemo(() => {
    const result = categories.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase())
    );

    if (sortBy === "count") {
      result.sort((a, b) => (b.recipeCount || 0) - (a.recipeCount || 0));
    } else if (sortBy === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "time") {
      result.sort((a, b) => (a.avgCookTimeMinutes || 999) - (b.avgCookTimeMinutes || 999));
    }

    return result;
  }, [categories, search, sortBy]);

  if (isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 pb-16">
        {[1, 2, 3, 4, 5, 6].map((idx) => (
          <div
            key={idx}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft animate-pulse flex flex-col"
          >
            <div className="aspect-[16/9] bg-muted" />
            <div className="p-5 flex flex-col flex-1 space-y-3">
              <div className="h-6 bg-muted rounded w-1/3" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="pt-4 border-t border-border flex justify-between items-center mt-auto">
                <div className="h-3 bg-muted rounded w-20" />
                <div className="h-3 bg-muted rounded w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Search & Sort Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-soft">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories by name or keyword..."
            className="pl-9.5 pr-8 h-10 rounded-xl bg-background border-border text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear category search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-muted-foreground shrink-0">
          <ArrowUpDown className="size-3.5 text-primary" />
          <span className="font-medium hidden md:inline">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "count" | "name" | "time")}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="count">Most recipes</option>
            <option value="name">Name (A-Z)</option>
            <option value="time">Quickest cook time</option>
          </select>
        </div>
      </div>

      {/* Grid Results */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-soft my-8">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
            <UtensilsCrossed className="size-6" />
          </div>
          <h3 className="font-display text-xl font-semibold text-foreground">
            No matching categories
          </h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
            We couldn&apos;t find any category matching &ldquo;{search}&rdquo;. Try another keyword.
          </p>
          <button
            onClick={() => setSearch("")}
            className="mt-4 text-xs font-semibold text-primary hover:underline"
          >
            Clear search filter
          </button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((category) => (
            <CategoryCard key={category.id || category.slug} category={category} />
          ))}
        </div>
      )}
    </div>
  );
}

export default CategoryGrid;
