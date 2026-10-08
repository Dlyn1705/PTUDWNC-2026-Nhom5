import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChefHat } from "lucide-react";
import { CategoryDto } from "@/types/category.types";

interface CategoryCardProps {
  category: CategoryDto;
}

export function CategoryCard({ category }: CategoryCardProps) {
  const recipeLabel =
    category.recipeCount === 1
      ? "1 recipe"
      : `${category.recipeCount || 0} recipes`;

  const categoryImages: Record<string, string> = {
    appetizers:
      "https://images.unsplash.com/photo-1541014741259-de529411b96a?q=80&w=800&auto=format&fit=crop",

    "main-courses":
      "https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=800&auto=format&fit=crop",

    desserts:
      "https://images.unsplash.com/photo-1551024506-0bccd828d307?q=80&w=800&auto=format&fit=crop",

    breakfast:
      "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?q=80&w=800&auto=format&fit=crop",

    vegetarian:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800&auto=format&fit=crop",

    "vietnamese-cuisine":
      "https://images.unsplash.com/photo-1559314809-0d155014e29e?q=80&w=800&auto=format&fit=crop",

    "korean-cuisine":
      "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?q=80&w=800&auto=format&fit=crop",

    "japanese-cuisine":
      "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=800&auto=format&fit=crop",

    "chinese-cuisine":
      "https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=800&auto=format&fit=crop",

    "thai-cuisine":
      "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?q=80&w=800&auto=format&fit=crop",

    "italian-cuisine":
      "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?q=80&w=800&auto=format&fit=crop",

    "french-cuisine":
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=800&auto=format&fit=crop",

    "mexican-cuisine":
      "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?q=80&w=800&auto=format&fit=crop",

    "indian-cuisine":
      "https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=800&auto=format&fit=crop",

    "american-cuisine":
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=800&auto=format&fit=crop",

    seafood:
      "https://images.unsplash.com/photo-1544943910-4c1dc44aab44?q=80&w=800&auto=format&fit=crop",

    "grilled-dishes":
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=800&auto=format&fit=crop",

    "fried-dishes":
      "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?q=80&w=800&auto=format&fit=crop",

    "steamed-dishes":
      "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?q=80&w=800&auto=format&fit=crop",

    beverages:
      "https://images.unsplash.com/photo-1544145945-f90425340c7e?q=80&w=800&auto=format&fit=crop",
  };

  const imageUrl =
    category.imageUrl ||
    categoryImages[category.slug?.toLowerCase()] ||
    "https://images.unsplash.com/photo-1495521821757-a1efb6729352?q=80&w=800&auto=format&fit=crop";

  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
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
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ChefHat className="size-10 text-muted-foreground/40" />
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
            "Explore delicious recipes and cooking techniques in this category."}
        </p>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end border-t border-border pt-4">
          <div className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5 sm:text-sm">
            <span>View recipes</span>
            <ArrowRight className="size-3.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default CategoryCard;