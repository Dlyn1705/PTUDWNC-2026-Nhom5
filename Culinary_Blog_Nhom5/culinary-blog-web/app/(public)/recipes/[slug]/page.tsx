import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { recipeApi } from "@/lib/api/recipeApi";
import { RecipeHero } from "@/components/recipes/RecipeHero";
import { IngredientList } from "@/components/recipes/IngredientList";
import { NutritionCard } from "@/components/recipes/NutritionCard";
import { StepByStepList } from "@/components/recipes/StepByStepList";
import { RecipeCard } from "@/components/recipes/RecipeCard";
import { ArrowRight } from "lucide-react";

interface RecipeDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: RecipeDetailPageProps) {
  const { slug } = await params;
  const recipe = await recipeApi.getBySlug(slug);

  if (!recipe) {
    return { title: "Recipe Not Found — Culinary Blog" };
  }

  const primaryImage =
    recipe.images?.find((i) => i.isPrimary)?.url || recipe.images?.[0]?.url;

  return {
    title: `${recipe.title} — Culinary Blog`,
    description: recipe.description,
    openGraph: {
      title: `${recipe.title} — Culinary Blog`,
      description: recipe.description,
      type: "article",
      publishedTime: recipe.createdAt,
      authors: [recipe.author?.displayName || "Culinary Chef"],
      images: primaryImage ? [{ url: primaryImage }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: recipe.title,
      description: recipe.description,
      images: primaryImage ? [primaryImage] : [],
    },
  };
}

export default async function RecipeDetailPage({ params }: RecipeDetailPageProps) {
  const { slug } = await params;
  const recipe = await recipeApi.getBySlug(slug);

  if (!recipe) {
    notFound();
  }

  // Fetch related recipes
  const allRecipes = await recipeApi.getAll();
  const relatedRecipes = allRecipes
    .filter((r) => r.id !== recipe.id && (r.categoryId === recipe.categoryId || r.categoryName === recipe.categoryName))
    .slice(0, 3);

  const primaryImage =
    recipe.images?.find((i) => i.isPrimary)?.url || recipe.images?.[0]?.url;

  // Schema.org Recipe JSON-LD format with complete 6 nutrition attributes
  const schemaLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    image: primaryImage ? [primaryImage] : [],
    author: {
      "@type": "Person",
      name: recipe.author?.displayName || "Culinary Chef",
    },
    datePublished: recipe.createdAt,
    description: recipe.description,
    prepTime: `PT${recipe.prepTimeMinutes}M`,
    cookTime: `PT${recipe.cookTimeMinutes}M`,
    totalTime: `PT${(recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0)}M`,
    recipeYield: `${recipe.servings} servings`,
    recipeCategory: recipe.categoryName || "Culinary",
    nutrition: {
      "@type": "NutritionInformation",
      calories: `${recipe.nutrition.calories} calories`,
      proteinContent: `${recipe.nutrition.protein} grams`,
      carbohydrateContent: `${recipe.nutrition.carbs} grams`,
      fatContent: `${recipe.nutrition.fat} grams`,
      fiberContent: `${recipe.nutrition.fiber || 0} grams`,
      sodiumContent: `${recipe.nutrition.sodium} milligrams`,
    },
    recipeIngredient: recipe.ingredients.map(
      (item) => `${item.quantity ? `${item.quantity} ` : ""}${item.unit} ${item.name}`.trim()
    ),
    recipeInstructions: recipe.steps.map((step) => ({
      "@type": "HowToStep",
      name: step.title || `Step ${step.order}`,
      text: step.text,
      image: step.imageUrl,
    })),
  };

  return (
    <article className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-12">
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaLd) }}
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
      <div className="grid gap-10 lg:grid-cols-12 items-start">
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
                  <img
                    src={recipe.author.avatarUrl}
                    alt={recipe.author.displayName}
                    className="size-12 rounded-full object-cover border-2 border-border"
                  />
                ) : (
                  <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base">
                    {recipe.author.displayName?.charAt(0) || "C"}
                  </div>
                )}
                <div>
                  <h4 className="font-display font-semibold text-base text-foreground">
                    Recipe by {recipe.author.displayName}
                  </h4>
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
        <main className="lg:col-span-7">
          <StepByStepList steps={recipe.steps} />
        </main>
      </div>

      {/* Related Recipes Section */}
      {relatedRecipes.length > 0 && (
        <section className="pt-12 border-t border-border space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                More in {recipe.categoryName || "this collection"}
              </p>
              <h3 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-foreground">
                You might also enjoy cooking
              </h3>
            </div>

            <Link
              href="/recipes"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              <span>Explore all recipes</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {relatedRecipes.map((rel) => (
              <RecipeCard key={rel.id} recipe={rel} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
