import React from "react";
import type { Metadata } from "next";
import CategoryHeader from "@/components/categories/CategoryHeader";
import CategoryGrid from "@/components/categories/CategoryGrid";
import { publicApi } from "@/lib/api/serverClient";
import { buildListingMetadata } from "@/lib/seo/metadata";

export const revalidate = 300;

export const metadata: Metadata = buildListingMetadata(
  "/categories",
  "All Categories",
  "Every corner of the kitchen, organised. Pick a category to see its full recipe collection.",
);

export default async function CategoriesPage() {
  // Keep the production build independent from API availability. In a live
  // deployment the route revalidates and repopulates once the API is ready.
  const categories = await publicApi.getCategories().catch(() => []);

  const totalCategories = categories.length;
  const totalRecipes = categories.reduce(
    (acc, cat) => acc + (cat.recipeCount || 0),
    0
  );

  return (
    <div className="page-container py-8">
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
