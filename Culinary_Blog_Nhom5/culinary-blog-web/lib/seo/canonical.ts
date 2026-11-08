import { categoryUrl, publicListingUrl, recipeUrl } from "./siteUrl";

export function recipeCanonical(slug: string): string {
  return recipeUrl(slug);
}
export function categoryCanonical(slug: string, page = 1): string {
  return categoryUrl(slug, page);
}

export function listingCanonical(pathname: "/" | "/recipes" | "/categories" | "/search"): string {
  return publicListingUrl(pathname);
}

export function hasQueryParams(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): boolean {
  return Object.entries(searchParams ?? {}).some(([key, value]) => {
    if (key === "_" || key === "utm_source" || key === "utm_medium" || key === "utm_campaign") return false;
    return Array.isArray(value) ? value.some(Boolean) : Boolean(value);
  });
}
