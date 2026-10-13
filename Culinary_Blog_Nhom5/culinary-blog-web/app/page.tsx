import React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Clock,
  Users,
  CheckCircle2,
  Timer,
  Heart,
  Flame,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { RecipeGrid } from "@/components/recipes/RecipeGrid";
import { difficultyLabel } from "@/types/recipe.types";
import { RecipeBookmark } from "@/components/recipes/RecipeBookmark";
import { CategoryCard } from "@/components/categories/CategoryCard";
import { categoryApi } from "@/lib/api/categoryApi";
import { recipeApi } from "@/lib/api/recipeApi";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Culinary Blog — Recipes worth cooking twice",
  description:
    "Slow, twice-tested recipes: handmade pasta, slow roasts, artisan baking and fresh salads, written for real home kitchens.",
  openGraph: {
    title: "Culinary Blog — Recipes worth cooking twice",
    description:
      "Slow, twice-tested recipes written for real home kitchens and everyday ingredients.",
    type: "website",
  },
};

export default async function HomePage() {
  const [categories, recipes] = await Promise.all([
    categoryApi.getAll(),
    recipeApi.getAll(),
  ]);

  const featured = recipes[0];
  const latestRecipes = recipes.slice(1, 7);
  const featuredImage =
    featured?.images?.find((i) => i.isPrimary) ?? featured?.images?.[0];
  const featuredTotalMinutes =
    (featured?.prepTimeMinutes || 0) + (featured?.cookTimeMinutes || 0);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-20">
        {/* Featured recipe banner */}
        <section aria-labelledby="featured-recipe-title" className="relative isolate overflow-hidden rounded-3xl bg-[#211b1c] text-white shadow-soft">
            <Image
              src={featuredImage?.url || "https://images.unsplash.com/photo-1547592180-85f173990554?q=80&w=1600&auto=format&fit=crop"}
              alt={featuredImage?.alt || featured?.title || "Freshly prepared food"}
              fill
              sizes="(max-width: 1280px) 100vw, 1216px"
              unoptimized
              loading="eager"
              className="-z-20 object-cover object-center"
            />
          <div className="absolute inset-0 -z-10 bg-linear-to-r from-black/75 via-black/40 to-black/5" />
          <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/35 via-transparent to-transparent" />

          {featured && (
            <div className="absolute right-5 top-5 sm:right-6 sm:top-6">
              <RecipeBookmark slug={featured.slug} />
            </div>
          )}

          <div className="flex min-h-[530px] flex-col items-start px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
            <p className="mb-7 flex items-center gap-3 pr-12 text-xs font-semibold uppercase text-white/85">
              <span className="h-px w-9 bg-white/65" aria-hidden="true" />
              Recipe of the week
            </p>
            <h1 id="featured-recipe-title" className="max-w-[540px] text-3xl font-semibold leading-[1.18] tracking-tight sm:text-5xl lg:text-[52px]">
              {featured?.title || "Slow recipes written for real home kitchens."}
            </h1>
            <p className="mt-6 max-w-[440px] text-sm leading-relaxed text-white/85 sm:text-base line-clamp-3">
              {featured?.description || "Reliable, twice-tested recipes with smart step timers and precise ingredient measures."}
            </p>
            {featured && (
              <div className="mt-6 flex flex-wrap items-center gap-6 text-sm font-medium text-white/85 sm:text-base">
                <span className="inline-flex items-center gap-2"><Clock className="size-[18px]" />{featuredTotalMinutes} min</span>
                <span className="inline-flex items-center gap-2"><Users className="size-[18px]" />Serves {featured.servings}</span>
              </div>
            )}
            <Button asChild className="mt-6 h-12 rounded-full bg-[#3f5b48] px-7 font-semibold text-white hover:bg-[#304737]">
              <Link href={featured ? `/recipes/${featured.slug}` : "/recipes"}>
                {featured ? "Read the recipe" : "Explore recipes"}<ArrowRight className="ml-3 size-4" />
              </Link>
            </Button>
            {featured && (
              <div className="mt-auto flex flex-wrap gap-2 pt-12 text-xs text-[#302c29] sm:text-sm">
                <span className="inline-flex items-center gap-2 rounded-full bg-[#f5f0e9]/95 px-3.5 py-2.5"><Clock className="size-4" />{featuredTotalMinutes} minutes</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#f5f0e9]/95 px-3.5 py-2.5"><Flame className="size-4" />{difficultyLabel[featured.difficulty]}</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#f5f0e9]/95 px-3.5 py-2.5"><Users className="size-4" />Serves {featured.servings}</span>
              </div>
            )}
          </div>
        </section>

        {/* Browse by Category Section (FR-CAT-001) */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                The Collections
              </p>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-foreground">
                Browse by category
              </h2>
            </div>

            <Link
              href="/categories"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline group"
            >
              <span>View all categories</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 4).map((category) => (
              <CategoryCard key={category.id || category.slug} category={category} />
            ))}
          </div>
        </section>

        {/* Latest Recipes Section (FR-RCP-001) */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Fresh from the oven
              </p>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-foreground">
                Latest recipes
              </h2>
            </div>

            <Link
              href="/recipes"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline group"
            >
              <span>See all recipes</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <RecipeGrid recipes={latestRecipes} />
        </section>

        {/* The Kitchen Promise (Brand Value Pillar) */}
        <section className="rounded-3xl border border-border bg-card p-8 sm:p-12 shadow-soft">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Our Philosophy
            </p>
            <h2 className="font-display text-3xl font-bold text-foreground">
              The Culinary Blog Promise
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Cooking should be rewarding, not stressful. Every dish on this site adheres to three principles.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-6 space-y-3 text-center sm:text-left shadow-2xs">
              <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <CheckCircle2 className="size-5" />
              </div>
              <h3 className="font-display font-semibold text-lg text-foreground">
                Twice-Tested Recipes
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Tested once for taste, and once again to confirm exact timings, ingredient ratios, and temperature tolerances.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background p-6 space-y-3 text-center sm:text-left shadow-2xs">
              <div className="size-10 rounded-xl bg-ember/15 text-ember flex items-center justify-center font-bold">
                <Timer className="size-5" />
              </div>
              <h3 className="font-display font-semibold text-lg text-foreground">
                Integrated Step Timers
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                No guessing when tomatoes blister or onions caramelize. Built-in timers count down directly inside each instruction step.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background p-6 space-y-3 text-center sm:text-left shadow-2xs">
              <div className="size-10 rounded-xl bg-herb/20 text-herb flex items-center justify-center font-bold">
                <Heart className="size-5" />
              </div>
              <h3 className="font-display font-semibold text-lg text-foreground">
                Everyday Ingredients
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                No elusive pantry items that sit in your cabinet for five years. Accessible, honest foods with clear substitutions.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
