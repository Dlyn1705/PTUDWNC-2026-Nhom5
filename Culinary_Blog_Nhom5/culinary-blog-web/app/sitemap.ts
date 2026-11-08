import { MetadataRoute } from "next";
import { publicApi } from "@/lib/api/serverClient";
import type { RecipeSummaryDto } from "@/types/recipe.types";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://culinaryblog.local")
    .trim()
    .replace(/\/+$/, "");

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/recipes`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/categories`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  try {
    const categories = await publicApi.getCategories();
    const categoryRoutes: MetadataRoute.Sitemap = categories
      .filter((category) => Boolean(category && category.slug))
      .map((category) => ({
        url: `${baseUrl}/categories/${category.slug}`,
        changeFrequency: "weekly",
        priority: 0.7,
      }));

    const recipes: RecipeSummaryDto[] = [];
    let page = 1;
    const MAX_PAGES = 500;

    do {
      const result = await publicApi.getRecipes({
        page,
        pageSize: 50,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      // Strict defense-in-depth: only Published recipes with valid slug
      const validPublished = (result.data || []).filter(
        (recipe) => recipe && recipe.status === 1 && Boolean(recipe.slug),
      );
      recipes.push(...validPublished);

      if (!result.meta?.hasNextPage || page >= MAX_PAGES) break;
      page += 1;
    } while (true);

    const recipeRoutes: MetadataRoute.Sitemap = recipes.map((recipe) => {
      const rawDate = recipe.updatedAt || recipe.publishedAt || recipe.createdAt;
      const parsedDate = rawDate ? new Date(rawDate) : new Date();
      const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

      return {
        url: `${baseUrl}/recipes/${recipe.slug}`,
        lastModified: validDate,
        changeFrequency: "monthly",
        priority: 0.8,
      };
    });

    return [...staticRoutes, ...categoryRoutes, ...recipeRoutes];
  } catch (error) {
    console.error("[Sitemap] Upstream API request failed, returning static fallback sitemap:", error);
    return staticRoutes;
  }
}
