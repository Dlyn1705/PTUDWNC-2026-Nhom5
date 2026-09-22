import React from "react";
import Link from "next/link";
import { Clock, ArrowRight, ChefHat } from "lucide-react";
import { CategoryDto } from "@/types/category.types";

interface CategoryCardProps {
  category: CategoryDto;
}

export function CategoryCard({ category }: CategoryCardProps) {
  const recipeLabel =
    category.recipeCount === 1 ? "1 recipe" : `${category.recipeCount} recipes`;

  const fallbackImage =
    "https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=800&auto=format&fit=crop";

  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:shadow-lift hover:-translate-y-1"
    >
      {/* Category Image with Count Badge */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {category.imageUrl || fallbackImage ? (
          <img
            src={category.imageUrl || fallbackImage}
            alt={category.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ChefHat className="size-10 text-muted-foreground/40" />
          </div>
        )}

        {/* Recipe Count Badge */}
        <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground tabular-nums shadow-sm">
          {recipeLabel}
        </span>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="font-display text-xl sm:text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">
          {category.name}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground flex-1">
          {category.description || "Explore delicious recipes and cooking techniques in this category."}
        </p>

        {/* Card Footer: Avg cook time and View recipes */}
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs sm:text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5 text-primary" />
            <span className="tabular-nums">
              {category.recipeCount > 0 && category.avgCookTimeMinutes
                ? `~${category.avgCookTimeMinutes} min avg`
                : "No recipes yet"}
            </span>
          </div>

          <div className="inline-flex items-center gap-1 font-semibold text-primary group-hover:translate-x-0.5 transition-transform text-xs">
            <span>View recipes</span>
            <ArrowRight className="size-3.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default CategoryCard;
