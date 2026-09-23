import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Users,
  Sparkles,
  Search,
  CheckCircle2,
  Timer,
  Heart,
  ChefHat,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { RecipeGrid } from "@/components/recipes/RecipeGrid";
import { DifficultyBadge } from "@/components/recipes/RecipeCard";
import { categoryApi } from "@/lib/api/categoryApi";
import { recipeApi } from "@/lib/api/recipeApi";

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
        {/* Hero Introduction Banner */}
        <section className="relative overflow-hidden rounded-3xl border border-border bg-radial from-card via-card to-muted/40 p-8 sm:p-12 lg:p-16 text-center shadow-soft">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
              <Sparkles className="size-3.5" />
              <span>Tested Twice for Guaranteed Deliciousness</span>
            </div>

            <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-foreground leading-[1.12]">
              Slow recipes written for real home kitchens.
            </h1>

            <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
              No twenty-page stories. Just reliable, rigorously tested recipes with smart step timers, precise ingredient measures, and guaranteed comfort.
            </p>

            {/* Quick Search Box */}
            <div className="mx-auto max-w-xl pt-2">
              <form
                action="/search"
                method="GET"
                className="flex items-center gap-2 rounded-full border border-border bg-background p-1.5 shadow-soft transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
              >
                <div className="flex items-center pl-4 text-muted-foreground">
                  <Search className="size-4" />
                </div>
                <input
                  type="text"
                  name="q"
                  placeholder="Search recipes (e.g., Pasta, Roast Chicken, Salad)..."
                  className="w-full bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                />
                <Button type="submit" className="rounded-full px-6 shadow-soft shrink-0">
                  Search
                </Button>
              </form>

              {/* Popular Tags */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">Trending:</span>
                <Link
                  href="/categories/pasta"
                  className="rounded-full bg-muted/60 px-3 py-1 hover:bg-accent hover:text-foreground transition-colors"
                >
                  Pasta
                </Link>
                <Link
                  href="/categories/mains"
                  className="rounded-full bg-muted/60 px-3 py-1 hover:bg-accent hover:text-foreground transition-colors"
                >
                  Roast Chicken
                </Link>
                <Link
                  href="/categories/baking"
                  className="rounded-full bg-muted/60 px-3 py-1 hover:bg-accent hover:text-foreground transition-colors"
                >
                  Olive Oil Cake
                </Link>
                <Link
                  href="/recipes/pho-bo-truyen-thong-ha-noi"
                  className="rounded-full bg-muted/60 px-3 py-1 hover:bg-accent hover:text-foreground transition-colors"
                >
                  Phở Bò
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Recipe Hero of the Week */}
        {featured ? (
          <section className="relative grid items-center gap-8 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-soft md:grid-cols-12 md:p-10 lg:gap-12">
            <div className="space-y-5 md:col-span-6 lg:col-span-7">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary-foreground shadow-2xs">
                  Recipe of the week
                </span>
                <DifficultyBadge difficulty={featured.difficulty} />
                {featured.categoryName && (
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {featured.categoryName}
                  </span>
                )}
              </div>

              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-foreground">
                <Link
                  href={`/recipes/${featured.slug}`}
                  className="hover:text-primary transition-colors"
                >
                  {featured.title}
                </Link>
              </h2>

              <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                {featured.description}
              </p>

              <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground tabular-nums pt-2">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Clock className="size-4 text-primary" />
                  {featuredTotalMinutes} mins total
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Users className="size-4 text-primary" />
                  Serves {featured.servings}
                </span>
                {featured.author && (
                  <span className="inline-flex items-center gap-2 font-medium">
                    {featured.author.avatarUrl ? (
                      <img
                        src={featured.author.avatarUrl}
                        alt={featured.author.displayName}
                        className="size-5 rounded-full object-cover border"
                      />
                    ) : (
                      <ChefHat className="size-4 text-primary" />
                    )}
                    {featured.author.displayName}
                  </span>
                )}
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Button asChild className="h-11 rounded-full px-7 shadow-soft font-semibold">
                  <Link href={`/recipes/${featured.slug}`}>
                    View Complete Recipe <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>

                <Button asChild variant="outline" className="h-11 rounded-full px-6">
                  <Link href="/recipes">Explore All Recipes</Link>
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-muted shadow-soft md:col-span-6 lg:col-span-5">
              {featuredImage ? (
                <Link href={`/recipes/${featured.slug}`} className="block group">
                  <img
                    src={featuredImage.url}
                    alt={featuredImage.alt || featured.title}
                    className="aspect-[4/3] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    loading="eager"
                  />
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Browse by Category Section */}
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

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 4).map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:shadow-lift hover:-translate-y-1"
              >
                {/* Category Thumbnail */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                  {category.imageUrl ? (
                    <img
                      src={category.imageUrl}
                      alt={category.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/40">
                      <ChefHat className="size-8" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-primary/95 px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-2xs backdrop-blur-xs">
                    {category.recipeCount} {category.recipeCount === 1 ? "recipe" : "recipes"}
                  </span>
                </div>

                <div className="p-5 flex flex-1 flex-col justify-between">
                  <div>
                    <h3 className="font-display text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                      {category.name}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {category.description}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-end border-t border-border pt-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-primary inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Explore <ArrowRight className="size-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Latest Recipes Section */}
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
            <div className="rounded-2xl border border-border bg-background p-6 space-y-3 text-center sm:text-left">
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

            <div className="rounded-2xl border border-border bg-background p-6 space-y-3 text-center sm:text-left">
              <div className="size-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                <Timer className="size-5" />
              </div>
              <h3 className="font-display font-semibold text-lg text-foreground">
                Integrated Step Timers
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                No guessing when tomatoes blister or onions caramelize. Built-in timers count down directly inside each instruction step.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background p-6 space-y-3 text-center sm:text-left">
              <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
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
