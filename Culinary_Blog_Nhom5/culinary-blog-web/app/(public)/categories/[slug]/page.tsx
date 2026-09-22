import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryApi } from "@/lib/api/categoryApi";
import { UtensilsIcon } from "@/components/common/Icons";

interface CategoryDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoryDetailPageProps) {
  const { slug } = await params;
  const category = await categoryApi.getBySlug(slug);

  if (!category) {
    return { title: "Category Not Found - Culinary Blog" };
  }

  return {
    title: `${category.name} Recipes - Culinary Blog`,
    description: category.description || `Explore delicious ${category.name} recipes.`,
  };
}

export default async function CategoryDetailPage({ params }: CategoryDetailPageProps) {
  const { slug } = await params;
  const category = await categoryApi.getBySlug(slug);

  if (!category) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-zinc-500 mb-8 font-medium">
        <Link href="/" className="hover:text-zinc-900 transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link href="/categories" className="hover:text-zinc-900 transition-colors">
          Categories
        </Link>
        <span>/</span>
        <span className="text-zinc-800">{category.name}</span>
      </nav>

      {/* Category Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-zinc-900 text-white min-h-[260px] flex items-end p-8 sm:p-12 mb-12 shadow-lg">
        {category.imageUrl && (
          <img
            src={category.imageUrl}
            alt={category.name}
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold uppercase tracking-wider">
            <UtensilsIcon className="w-3.5 h-3.5" />
            <span>Category</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight">
            {category.name}
          </h1>
          <p className="text-zinc-200 text-base sm:text-lg leading-relaxed">
            {category.description}
          </p>
        </div>
      </div>

      {/* Recipes Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
          <h2 className="text-2xl font-serif font-bold text-zinc-900">
            {category.name} Recipes
          </h2>
          <span className="text-sm text-zinc-500">
            {category.recipeCount} {category.recipeCount === 1 ? "recipe" : "recipes"}
          </span>
        </div>

        {category.recipeCount === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-zinc-100 p-8 shadow-2xs">
            <p className="text-zinc-500 text-base">
              No recipes have been published in this category yet.
            </p>
            <Link
              href="/categories"
              className="inline-block mt-4 text-sm font-medium text-[#DC4E3D] hover:underline"
            >
              ← Back to all categories
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-zinc-100 p-8 text-center text-zinc-500 shadow-2xs">
            <p>Recipes for {category.name} will be listed here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
