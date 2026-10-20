import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { publicApi } from "@/lib/api/serverClient";
import { Can } from "@/components/auth/Can";
import { RecipesCatalogView } from "@/components/recipes/RecipesCatalogView";
import { UtensilsCrossed, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const revalidate = 120;

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

type CatalogSortBy = "createdAt" | "cookTime" | "title";
type SortOrder = "asc" | "desc";

const sortByMap: Record<string, CatalogSortBy> = {
  createdat: "createdAt",
  cooktime: "cookTime",
  title: "title",
};

const legacySortMap: Record<string, { sortBy: CatalogSortBy; sortOrder: SortOrder }> = {
  newest: { sortBy: "createdAt", sortOrder: "desc" },
  time: { sortBy: "cookTime", sortOrder: "asc" },
  title: { sortBy: "title", sortOrder: "asc" },
  createdat: { sortBy: "createdAt", sortOrder: "asc" },
  "-createdat": { sortBy: "createdAt", sortOrder: "desc" },
  cooktime: { sortBy: "cookTime", sortOrder: "asc" },
  "-cooktime": { sortBy: "cookTime", sortOrder: "desc" },
  "-title": { sortBy: "title", sortOrder: "desc" },
};

export default async function RecipesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const rawPage = Number(first(params.page));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1;
  const categoryId = first(params.categoryId) || "all";
  const rawDifficulty = first(params.difficulty);
  const difficulty = rawDifficulty && ["1", "2", "3", "4"].includes(rawDifficulty) ? rawDifficulty : "all";
  const rawSortBy = (first(params.sortBy) ?? "").toLowerCase();
  const rawSortOrder = first(params.sortOrder);
  const legacySort = (first(params.sort) ?? "").toLowerCase();
  const canonicalSortBy = sortByMap[rawSortBy];
  const canonicalSortOrder = rawSortOrder === "asc" || rawSortOrder === "desc" ? rawSortOrder : undefined;
  const resolvedSort = canonicalSortBy
    ? { sortBy: canonicalSortBy, sortOrder: canonicalSortOrder ?? "desc" as SortOrder }
    : legacySortMap[legacySort] ?? { sortBy: "createdAt" as CatalogSortBy, sortOrder: "desc" as SortOrder };
  const { sortBy, sortOrder } = resolvedSort;

  if (legacySort) {
    const canonicalParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "sort" || key === "sortBy" || key === "sortOrder") continue;
      const firstValue = first(value);
      if (firstValue !== undefined) canonicalParams.set(key, firstValue);
    }
    canonicalParams.set("sortBy", sortBy);
    canonicalParams.set("sortOrder", sortOrder);
    redirect(`/recipes?${canonicalParams.toString()}`);
  }

  const query = {
    page,
    pageSize: 12,
    categoryId: categoryId === "all" ? undefined : categoryId,
    difficulty: difficulty === "all" ? undefined : Number(difficulty),
    sortBy,
    sortOrder,
  };
  const [firstResult, categories] = await Promise.all([
    publicApi.getRecipes(query),
    publicApi.getCategories(),
  ]);
  const result = firstResult.meta.totalPages > 0 && page > firstResult.meta.totalPages
    ? await publicApi.getRecipes({ ...query, page: firstResult.meta.totalPages })
    : firstResult;
  const totalPublished = categories.reduce((total, category) => total + category.recipeCount, 0);

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
          
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            All Recipes
          </h1>

          <p className="max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Slow, twice-tested recipes written for real home kitchens and everyday ingredients. Switch between grid and list view below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-soft">
            <UtensilsCrossed className="size-4 text-primary" />
            <span className="tabular-nums font-semibold text-foreground">
              {totalPublished} recipes published
            </span>
          </div>

          <Can role="Author">
            <Button asChild className="rounded-2xl gap-2 shadow-soft h-11 px-5 font-medium">
              <Link href="/dashboard/recipes/new">
                <Plus className="size-4" />
                <span>Tạo công thức</span>
              </Link>
            </Button>
          </Can>
        </div>
      </div>

      {/* Catalog View with Interactive Grid/List toggle & Category filters */}
      <RecipesCatalogView initialRecipes={result.data} meta={result.meta} totalPublished={totalPublished} categories={categories} selectedCategory={categoryId} selectedDifficulty={difficulty} sortBy={sortBy} sortOrder={sortOrder} />
    </div>
  );
}
