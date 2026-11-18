import React from "react";
import { connection } from "next/server";
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
  // Keep the public data cache, but do not contact the API during the build.
  await connection();
  const categories = await publicApi.getCategories();

  const totalCategories = categories.length;
  const totalRecipes = categories.reduce(
    (acc, cat) => acc + (cat.recipeCount || 0),
    0,
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
