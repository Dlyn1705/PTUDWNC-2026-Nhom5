import React from "react";
import { CategoryDto } from "@/types/category.types";
import CategoryCard from "./CategoryCard";

interface CategoryGridProps {
  categories: CategoryDto[];
  isLoading?: boolean;
}

export default function CategoryGrid({
  categories,
  isLoading = false,
}: CategoryGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-16">
        {[1, 2, 3, 4, 5, 6].map((idx) => (
          <div
            key={idx}
            className="bg-white rounded-3xl border border-zinc-100 overflow-hidden shadow-sm animate-pulse flex flex-col h-[400px]"
          >
            <div className="h-60 bg-zinc-200" />
            <div className="p-6 flex flex-col flex-1 space-y-4">
              <div className="h-6 bg-zinc-200 rounded-md w-1/3" />
              <div className="h-4 bg-zinc-100 rounded-md w-full" />
              <div className="h-4 bg-zinc-100 rounded-md w-2/3" />
              <div className="pt-4 border-t border-zinc-100 flex justify-between items-center mt-auto">
                <div className="h-4 bg-zinc-100 rounded-md w-20" />
                <div className="h-4 bg-zinc-200 rounded-md w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="py-20 text-center bg-white rounded-3xl border border-zinc-100 p-12 my-8 shadow-xs">
        <h3 className="text-xl font-serif font-bold text-zinc-900">
          No categories found
        </h3>
        <p className="mt-2 text-zinc-500 text-sm">
          Please check back later or add categories from the admin dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
      {categories.map((category) => (
        <CategoryCard key={category.id || category.slug} category={category} />
      ))}
    </div>
  );
}
