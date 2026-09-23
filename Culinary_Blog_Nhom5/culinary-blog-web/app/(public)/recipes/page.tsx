import React from "react";
import Link from "next/link";
import { recipeApi } from "@/lib/api/recipeApi";
import { categoryApi } from "@/lib/api/categoryApi";
import { RecipesCatalogView } from "@/components/recipes/RecipesCatalogView";
import { UtensilsCrossed, Sparkles } from "lucide-react";

export const metadata = {
  title: "All Recipes — Culinary Blog",
  description:
    "Explore our complete collection of twice-tested recipes: handmade pasta, slow mains, artisan baking and crisp salads for real kitchens.",
  openGraph: {
    title: "All Recipes — Culinary Blog",
    description: "Explore our complete collection of twice-tested recipes.",
    type: "website",
  },
};

export default async function RecipesPage() {
  const [recipes, categories] = await Promise.all([
    recipeApi.getAll(),
    categoryApi.getAll(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">Recipes Catalog</span>
      </nav>

      {/* Header Banner */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3" />
            <span>The Complete Collection</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            All Recipes
          </h1>

          <p className="max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Slow, twice-tested recipes written for real home kitchens and everyday ingredients. Switch between grid and list view below.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-soft">
          <UtensilsCrossed className="size-4 text-primary" />
          <span className="tabular-nums font-semibold text-foreground">
            {recipes.length} recipes published
          </span>
        </div>
      </div>

      {/* Catalog View with Interactive Grid/List toggle & Category filters */}
      <RecipesCatalogView initialRecipes={recipes} categories={categories} />
    </div>
  );
}
