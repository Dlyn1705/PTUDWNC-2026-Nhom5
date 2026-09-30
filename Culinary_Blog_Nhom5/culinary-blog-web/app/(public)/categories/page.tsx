import React from "react";
import type { Metadata } from "next";
import CategoryHeader from "@/components/categories/CategoryHeader";
import CategoryGrid from "@/components/categories/CategoryGrid";
import { categoryApi } from "@/lib/api/categoryApi";

export const metadata: Metadata = {
  title: "All Categories - Culinary Blog",
  description:
    "Every corner of the kitchen, organised. Pick a category to see its full recipe collection.",
  openGraph: {
    title: "All Categories - Culinary Blog",
    description:
      "Every corner of the kitchen, organised. Pick a category to see its full recipe collection.",
    type: "website",
  },
};

export default async function CategoriesPage() {
  const categories = await categoryApi.getAll();

  const totalCategories = categories.length;
  const totalRecipes = categories.reduce(
    (acc, cat) => acc + (cat.recipeCount || 0),
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header with Breadcrumb & Statistics */}
      <CategoryHeader
        totalCategories={totalCategories}
        totalRecipes={totalRecipes}
      />

      {/* Categories Grid */}
      <CategoryGrid categories={categories} />
    </div>
  );
}
