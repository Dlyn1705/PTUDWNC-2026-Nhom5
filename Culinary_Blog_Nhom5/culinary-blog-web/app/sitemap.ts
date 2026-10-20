import { MetadataRoute } from "next";
import { publicApi } from "@/lib/api/serverClient";
import type { RecipeSummaryDto } from "@/types/recipe.types";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://culinaryblog.local";

  const categories = await publicApi.getCategories();
  const recipes: RecipeSummaryDto[] = [];
  let page = 1;
  do {
    const result = await publicApi.getRecipes({
      page,
      pageSize: 50,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    recipes.push(...result.data);
    if (!result.meta.hasNextPage) break;
    page += 1;
  } while (true);

  // Static core routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/recipes`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/categories`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  // Dynamic category routes
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${baseUrl}/categories/${category.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Dynamic recipe routes (Published only)
  const recipeRoutes: MetadataRoute.Sitemap = recipes.map((recipe) => ({
    url: `${baseUrl}/recipes/${recipe.slug}`,
    lastModified: new Date(recipe.updatedAt || recipe.publishedAt || recipe.createdAt),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...categoryRoutes, ...recipeRoutes];
}
