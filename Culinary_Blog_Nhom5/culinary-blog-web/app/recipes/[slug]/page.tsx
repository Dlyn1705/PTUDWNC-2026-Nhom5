import React from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { publicApi } from "@/lib/api/serverClient";
import { RecipeHero } from "@/components/recipes/RecipeHero";
import { IngredientList } from "@/components/recipes/IngredientList";
import { NutritionCard } from "@/components/recipes/NutritionCard";
import { StepByStepList } from "@/components/recipes/StepByStepList";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { ArrowRight } from "lucide-react";
import { buildRecipeJsonLd, serializeJsonLd } from "@/lib/seo/recipeJsonLd";
import { buildRecipeMetadata } from "@/lib/seo/metadata";
import { recipeUrl } from "@/lib/seo/siteUrl";

interface RecipeDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: RecipeDetailPageProps) {
  const { slug } = await params;
  const resolution = await publicApi.resolveRecipeSlug(slug);
  if (resolution?.redirected && resolution.currentSlug !== slug) {
    return {
      title: "Recipe moved — Culinary Blog",
      robots: { index: false, follow: false },
      alternates: { canonical: recipeUrl(resolution.currentSlug) },
    };
  }

  const recipe = await publicApi.getRecipe(slug);

  if (!recipe) {
    return {
      title: "Recipe Not Found — Culinary Blog",
      robots: { index: false, follow: false },
    };
  }

  return buildRecipeMetadata(recipe);
}

export default async function RecipeDetailPage({ params }: RecipeDetailPageProps) {
  const { slug } = await params;
  const resolution = await publicApi.resolveRecipeSlug(slug);
  if (resolution?.redirected && resolution.currentSlug !== slug) {
    permanentRedirect(`/recipes/${encodeURIComponent(resolution.currentSlug)}`);
  }

  const recipe = await publicApi.getRecipe(slug);

  if (!recipe) {
    notFound();
  }

  // Fetch related recipes
  const allRecipes = await publicApi.getRecipes({
    page: 1,
    pageSize: 12,
    categoryId: recipe.categoryId,
  });
  const relatedRecipes = allRecipes.data
    .filter((r) => r.id !== recipe.id && (r.categoryId === recipe.categoryId || r.categoryName === recipe.categoryName))
    .slice(0, 3);

  const schemaLd = buildRecipeJsonLd(recipe);

  return (
    <article className="page-container space-y-12 py-8">
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(schemaLd) }}
      />

      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span>/</span>
        <Link href="/recipes" className="transition-colors hover:text-primary">
          Recipes
        </Link>
        {recipe.categoryName && (
          <>
            <span>/</span>
            <Link
              href={`/categories/${recipe.categorySlug || recipe.categoryName.toLowerCase().replace(/\s+/g, "-")}`}
              className="transition-colors hover:text-primary"
            >
              {recipe.categoryName}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="font-medium text-foreground truncate max-w-xs sm:max-w-md">
          {recipe.title}
        </span>
      </nav>

      {/* Hero Section (Print, Share, Gallery, Metrics) */}
      <RecipeHero recipe={recipe} />

      {/* Main Recipe Body: Left (Ingredients + Nutrition) & Right (StepByStepList) */}
      <div className="grid gap-10 xl:grid-cols-12 items-start">
        {/* Left Column: Ingredients Checklist & 6-attribute Nutrition card */}
        <aside className="space-y-8 lg:col-span-5 lg:sticky lg:top-24">
          <IngredientList
            ingredients={recipe.ingredients}
            baseServings={recipe.servings}
          />

          <NutritionCard nutrition={recipe.nutrition} />

          {/* Author Spotlight Card */}
          {recipe.author && (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft space-y-4">
              <div className="flex items-center gap-3">
                {recipe.author.avatarUrl ? (
                  <Image
                    src={recipe.author.avatarUrl}
                    alt={recipe.author.displayName}
                    width={48}
                    height={48}
                    className="size-12 rounded-full object-cover border-2 border-border"
                  />
                ) : (
                  <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base">
                    {recipe.author.displayName?.charAt(0) || "C"}
                  </div>
                )}
                <div>
                  <h2 className="font-display font-semibold text-base text-foreground">
                    Recipe by {recipe.author.displayName}
                  </h2>
                  <p className="text-xs text-muted-foreground">Culinary Blog Resident Author</p>
                </div>
              </div>
              {recipe.author.bio && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {recipe.author.bio}
                </p>
              )}
            </div>
          )}
        </aside>

        {/* Right Column: Steps with Interactive Timers */}
        <div className="lg:col-span-7">
          <StepByStepList steps={recipe.steps} />
        </div>
      </div>

      {/* Related Recipes Section */}
      {relatedRecipes.length > 0 && (
        <section className="pt-12 border-t border-border space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                More in {recipe.categoryName || "this collection"}
              </p>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-foreground">
                You might also enjoy cooking
              </h2>
            </div>

            <Link
              href="/recipes"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              <span>Explore all recipes</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {relatedRecipes.map((rel) => (
              <RecipeCard key={rel.id} recipe={rel} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
