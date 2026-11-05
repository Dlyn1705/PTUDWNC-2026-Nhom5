import type { Metadata } from "next";
import type { CategoryDto } from "../../types/category.types";
import type { RecipeDetailDto } from "../../types/recipe.types";
import { categoryCanonical, listingCanonical, recipeCanonical } from "./canonical";
import {
  absoluteUrl,
  DEFAULT_RECIPE_OG_IMAGE,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  safeAbsoluteUrl,
} from "./siteUrl";
import { buildSeoDescription, buildSeoTitle } from "./text";

const DEFAULT_DESCRIPTION = "Seasonal, twice-tested recipes for real home kitchens.";

function metadataImage(source: string | null | undefined, alt: string) {
  return [{
    url: safeAbsoluteUrl(source) ?? absoluteUrl(DEFAULT_RECIPE_OG_IMAGE),
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt,
  }];
}
export function buildRecipeMetadata(recipe: RecipeDetailDto): Metadata {
  const title = buildSeoTitle(recipe.title);
  const description = buildSeoDescription(recipe.description, DEFAULT_DESCRIPTION);
  const canonical = recipeCanonical(recipe.slug);
  const primaryImage = recipe.images?.find((image) => image.isPrimary)?.url
    ?? recipe.images?.[0]?.url;

  return {
    title,
    description,
    alternates: { canonical },
    robots: recipe.status === 1
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      title,
      description,
      type: "article",
      url: canonical,
      publishedTime: recipe.publishedAt || recipe.createdAt,
      modifiedTime: recipe.updatedAt || recipe.publishedAt || recipe.createdAt,
      authors: [recipe.author?.displayName || "Culinary Blog"],
      images: metadataImage(primaryImage, recipe.title),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: metadataImage(primaryImage, recipe.title).map((image) => image.url),
    },
  };
}

export function buildCategoryMetadata(category: CategoryDto, page = 1): Metadata {
  const title = buildSeoTitle(`${category.name} Recipes`);
  const description = buildSeoDescription(
    category.description,
    `Browse tested ${category.name} recipes with timings and nutrition.`,
  );
  const canonical = categoryCanonical(category.slug, page);

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      images: metadataImage(category.imageUrl, `${category.name} recipes`),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: metadataImage(category.imageUrl, `${category.name} recipes`).map((image) => image.url),
    },
  };
}

export function buildListingMetadata(
  pathname: "/" | "/recipes" | "/categories" | "/search",
  title: string,
  description: string,
  noindex = false,
): Metadata {
  const normalizedTitle = buildSeoTitle(title);
  const normalizedDescription = buildSeoDescription(description, DEFAULT_DESCRIPTION);
  return {
    title: normalizedTitle,
    description: normalizedDescription,
    alternates: { canonical: listingCanonical(pathname) },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: normalizedTitle,
      description: normalizedDescription,
      type: "website",
      url: listingCanonical(pathname),
      images: metadataImage(DEFAULT_RECIPE_OG_IMAGE, "Culinary Blog"),
    },
    twitter: {
      card: "summary_large_image",
      title: normalizedTitle,
      description: normalizedDescription,
      images: [absoluteUrl(DEFAULT_RECIPE_OG_IMAGE)],
    },
  };
}
