import React from "react";
import Link from "next/link";
import { UtensilsIcon } from "../common/Icons";

interface CategoryHeaderProps {
  totalCategories: number;
  totalRecipes: number;
}

export default function CategoryHeader({
  totalCategories,
  totalRecipes,
}: CategoryHeaderProps) {
  return (
    <div className="pt-8 pb-10">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-zinc-500 mb-6 font-medium">
        <Link href="/" className="hover:text-zinc-900 transition-colors">
          Home
        </Link>
        <span>/</span>
        <span className="text-zinc-800">Categories</span>
      </nav>

      {/* Main Header Content with Badges */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          {/* Eyebrow */}
          <span className="inline-block text-xs font-bold tracking-widest text-[#DC4E3D] uppercase">
            Explore
          </span>

          {/* Headline H1 */}
          <h1 className="text-4xl sm:text-5xl font-serif font-bold text-zinc-900 tracking-tight">
            All categories
          </h1>

          {/* Description */}
          <p className="text-zinc-600 text-base sm:text-lg leading-relaxed">
            Every corner of the kitchen, organised. Pick a category to see its full recipe collection.
          </p>
        </div>

        {/* Counter Pill Badge */}
        <div className="self-start md:self-end">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-200/80 bg-white text-zinc-700 text-sm font-medium shadow-2xs">
            <UtensilsIcon className="w-4 h-4 text-[#DC4E3D]" />
            <span>
              {totalCategories} {totalCategories === 1 ? "category" : "categories"} ·{" "}
              {totalRecipes} {totalRecipes === 1 ? "recipe" : "recipes"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
