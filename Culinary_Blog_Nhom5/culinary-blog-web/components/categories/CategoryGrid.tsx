"use client";

import React, { useMemo } from "react";
import { CategoryDto } from "@/types/category.types";
import CategoryCard from "./CategoryCard";
import { UtensilsCrossed, Search, ArrowUpDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/common/Skeleton";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface CategoryGridProps {
  categories: CategoryDto[];
  isLoading?: boolean;
}

export function CategoryGrid({
  categories,
  isLoading = false,
}: CategoryGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.get("q") ?? "";
  const sortBy = searchParams?.get("sortBy") === "name" ? "name" : "count";

  const updateQuery = (key: "q" | "sortBy", value: string) => {
    const query = new URLSearchParams(searchParams?.toString() ?? "");
    if (!value || (key === "sortBy" && value === "count")) query.delete(key);
    else query.set(key, value);
    router.replace(`${pathname}${query.size ? `?${query.toString()}` : ""}`, { scroll: false });
  };

  const filtered = useMemo(() => {
    const result = categories.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase())
    );

    if (sortBy === "count") {
      result.sort((a, b) => (b.recipeCount || 0) - (a.recipeCount || 0));
    } else if (sortBy === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [categories, search, sortBy]);

  if (isLoading) {
    return (
      <LoadingState label="Đang tải danh mục…">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 pb-16">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft flex flex-col"
            >
              <Skeleton className="aspect-[16/9] rounded-none" />
              <div className="p-5 flex flex-col flex-1 space-y-3">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="pt-4 border-t border-border flex justify-between items-center mt-auto">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </LoadingState>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Search & Sort Controls Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 md:p-4 shadow-soft">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => updateQuery("q", e.target.value)}
            aria-label="Tìm danh mục"
            placeholder="Tìm danh mục theo tên hoặc từ khóa..."
            className="pl-9.5 pr-8 h-10 rounded-xl bg-background border-border text-sm"
          />
          {search && (
            <button
              onClick={() => updateQuery("q", "")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Xóa từ khóa tìm kiếm danh mục"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-muted-foreground shrink-0">
          <ArrowUpDown className="size-3.5 text-primary" />
          <label htmlFor="category-sort" className="font-medium hidden md:inline">Sắp xếp:</label>
          <select
            id="category-sort"
            aria-label="Sắp xếp danh mục"
            value={sortBy}
            onChange={(e) => updateQuery("sortBy", e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="count">Nhiều công thức nhất</option>
            <option value="name">Tên (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Grid Results */}
      {filtered.length === 0 ? (
        <EmptyState
          title={search ? "Không tìm thấy danh mục phù hợp" : "Chưa có danh mục nào"}
          description={
            search
              ? `Không tìm thấy danh mục nào khớp với “${search}”. Bạn hãy thử lại với từ khóa khác.`
              : "Hiện chưa có danh mục nào trong hệ thống."
          }
          icon={<UtensilsCrossed className="size-7" />}
          action={
            search ? (
              <button
                type="button"
                onClick={() => updateQuery("q", "")}
                className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-primary hover:bg-muted cursor-pointer"
              >
                Xóa bộ lọc tìm kiếm
              </button>
            ) : undefined
          }
          className="my-8"
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((category) => (
            <CategoryCard key={category.id || category.slug} category={category} />
          ))}
        </div>
      )}
    </div>
  );
}

export default CategoryGrid;
