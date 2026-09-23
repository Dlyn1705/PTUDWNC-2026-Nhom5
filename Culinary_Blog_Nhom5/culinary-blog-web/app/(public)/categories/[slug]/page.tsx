import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChefHat, UtensilsCrossed, ChevronLeft, ChevronRight } from "lucide-react";
import { categoryApi } from "@/lib/api/categoryApi";
import { RecipeGrid } from "@/components/recipes/RecipeGrid";
import { Button } from "@/components/ui/button";

interface CategoryDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: CategoryDetailPageProps) {
  const { slug } = await params;
  const result = await categoryApi.getBySlug(slug, 1, 1);

  if (!result) {
    return { title: "Category Not Found — Culinary Blog" };
  }

  const { category } = result;

  return {
    title: `${category.name} Recipes — Culinary Blog`,
    description:
      category.description || `Browse tested ${category.name} recipes with timings and nutrition.`,
    openGraph: {
      title: `${category.name} Recipes — Culinary Blog`,
      description:
        category.description || `Browse tested ${category.name} recipes with timings and nutrition.`,
      type: "website",
    },
  };
}

export default async function CategoryDetailPage({
  params,
  searchParams,
}: CategoryDetailPageProps) {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : {};
  const currentPage = Math.max(1, Number(sp.page || 1));
  const PAGE_SIZE = 12;

  const [result, allCategories] = await Promise.all([
    categoryApi.getBySlug(slug, currentPage, PAGE_SIZE),
    categoryApi.getAll(),
  ]);

  if (!result) {
    notFound();
  }

  const { category, recipes: paginatedRecipes, meta } = result;

  const cover =
    category.imageUrl ||
    paginatedRecipes[0]?.images?.find((i) => i.isPrimary)?.url ||
    paginatedRecipes[0]?.images?.[0]?.url;

  const otherCategories = allCategories.filter((c) => c.id !== category.id).slice(0, 3);

  const totalRecipes = meta.totalCount;
  const totalPages = meta.totalPages;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-12">
      {/* Breadcrumbs */}
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span>/</span>
        <Link href="/categories" className="transition-colors hover:text-primary">
          Categories
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{category.name}</span>
      </nav>

      {/* Category Hero Section */}
      <section className="grid items-center gap-8 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-soft md:grid-cols-2 md:p-10">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <span>Category Collection</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            {category.name}
          </h1>

          <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
            {category.description || "Explore our delicious collection of recipes in this category."}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 tabular-nums shadow-2xs font-semibold text-foreground">
              <UtensilsCrossed className="size-3.5 text-primary" />
              {totalRecipes} {totalRecipes === 1 ? "recipe" : "recipes"}
            </span>

          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-muted shadow-soft">
          {cover ? (
            <img
              src={cover}
              alt={category.name}
              className="aspect-[16/9] w-full object-cover transition-transform duration-700 hover:scale-105"
              loading="eager"
            />
          ) : (
            <div className="flex aspect-[16/9] w-full items-center justify-center bg-muted text-muted-foreground/30">
              <ChefHat className="size-12" />
            </div>
          )}
        </div>
      </section>

      {/* Recipes in Category */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="font-display text-2xl font-bold text-foreground">
            {category.name} Recipes
          </h2>
          <span className="text-xs sm:text-sm text-muted-foreground">
            Showing {paginatedRecipes.length} of {totalRecipes} {totalRecipes === 1 ? "recipe" : "recipes"}
          </span>
        </div>

        <RecipeGrid
          recipes={paginatedRecipes}
          emptyMessage={`No published recipes found in ${category.name} yet. Check back soon or browse other categories!`}
        />

        {/* Pagination Controls if > 12 recipes */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-6">
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              className="rounded-full gap-1"
            >
              <Link href={`/categories/${slug}?page=${currentPage - 1}`}>
                <ChevronLeft className="size-4" /> Previous
              </Link>
            </Button>

            <span className="text-xs font-semibold text-muted-foreground px-3">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              className="rounded-full gap-1"
            >
              <Link href={`/categories/${slug}?page=${currentPage + 1}`}>
                Next <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}
      </section>

      {/* Other Categories Section */}
      {otherCategories.length > 0 && (
        <section className="mt-20 border-t border-border pt-12 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                More Culinary Adventures
              </p>
              <h3 className="mt-1 font-display text-2xl font-bold text-foreground">
                Explore more collections
              </h3>
            </div>

            <Link
              href="/categories"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              <span>All categories</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {otherCategories.map((other) => (
              <Link
                key={other.id}
                href={`/categories/${other.slug}`}
                className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-all duration-300 hover:shadow-lift hover:-translate-y-1"
              >
                <h4 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                  {other.name}
                </h4>
                <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                  {other.description}
                </p>
                <p className="mt-3 text-xs font-semibold text-primary tabular-nums">
                  {other.recipeCount} {other.recipeCount === 1 ? "recipe" : "recipes"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
