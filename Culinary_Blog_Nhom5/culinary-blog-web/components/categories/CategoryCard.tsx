import React from "react";
import Link from "next/link";
import { CategoryDto } from "@/types/category.types";
import { ClockIcon, ArrowRightIcon } from "../common/Icons";

interface CategoryCardProps {
  category: CategoryDto;
}

export default function CategoryCard({ category }: CategoryCardProps) {
  const recipeLabel =
    category.recipeCount === 1 ? "1 recipe" : `${category.recipeCount} recipes`;

  const fallbackImage =
    "https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=800&auto=format&fit=crop";

  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex flex-col bg-white rounded-3xl border border-zinc-100/90 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 overflow-hidden cursor-pointer"
    >
      {/* Category Image with Count Badge */}
      <div className="relative h-60 w-full overflow-hidden bg-zinc-100">
        <img
          src={category.imageUrl || fallbackImage}
          alt={category.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        />

        {/* Recipe Count Badge on Top-Left */}
        <div className="absolute top-4 left-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#B8422A]/90 text-white shadow-sm backdrop-blur-xs">
            {recipeLabel}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-6 sm:p-7 flex flex-col flex-1">
        {/* Title */}
        <h3 className="text-2xl font-serif font-bold text-zinc-900 group-hover:text-[#DC4E3D] transition-colors">
          {category.name}
        </h3>

        {/* Description */}
        <p className="mt-2 text-zinc-600 text-sm leading-relaxed line-clamp-2 flex-1">
          {category.description || "Explore delicious recipes and cooking techniques in this category."}
        </p>

        {/* Card Footer: Avg time and View recipes */}
        <div className="pt-5 mt-5 border-t border-zinc-100 flex items-center justify-between text-xs sm:text-sm">
          {/* Left: Cooking Time */}
          <div className="flex items-center gap-1.5 text-zinc-500">
            <ClockIcon className="w-4 h-4 text-zinc-400" />
            <span>
              {category.recipeCount > 0 && category.avgCookTimeMinutes
                ? `~${category.avgCookTimeMinutes} min avg`
                : "No recipes yet"}
            </span>
          </div>

          {/* Right: CTA Link */}
          <div className="flex items-center gap-1 text-[#DC4E3D] font-medium text-xs sm:text-sm group-hover:text-[#C43D2C]">
            <span>View recipes</span>
            <ArrowRightIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  );
}
