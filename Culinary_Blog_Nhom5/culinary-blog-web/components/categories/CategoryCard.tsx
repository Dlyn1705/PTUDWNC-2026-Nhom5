import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChefHat } from "lucide-react";
import { CategoryDto } from "@/types/category.types";

export interface CategoryCardProps {
  category: CategoryDto;
}

export function CategoryCard({ category }: CategoryCardProps) {
  const recipeLabel =
    category.recipeCount === 1
      ? "1 công thức"
      : `${category.recipeCount || 0} công thức`;

  const imageUrl = category.imageUrl?.trim() || null;

  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 motion-reduce:transition-none hover:-translate-y-1 motion-reduce:hover:translate-y-0 hover:shadow-lift"
    >
      {/* Category Image */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={category.name}
            width={800}
            height={450}
            unoptimized
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out motion-reduce:transition-none group-hover:scale-105 motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ChefHat aria-hidden="true" className="size-10 text-muted-foreground/40" />
            <span className="sr-only">Danh mục chưa có ảnh đại diện</span>
          </div>
        )}

        {/* Recipe Count */}
        <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
          {recipeLabel}
        </span>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="font-display text-xl font-semibold text-foreground transition-colors group-hover:text-primary sm:text-2xl">
          {category.name}
        </h3>

        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
          {category.description ||
            "Khám phá các công thức và kỹ thuật nấu ăn trong danh mục này."}
        </p>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end border-t border-border pt-4">
          <div className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5 sm:text-sm">
            <span>Xem công thức</span>
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default CategoryCard;
