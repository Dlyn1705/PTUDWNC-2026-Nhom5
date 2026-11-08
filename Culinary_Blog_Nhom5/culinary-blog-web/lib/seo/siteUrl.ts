const DEFAULT_SITE_ORIGIN = "https://culinaryblog.local";

function configuredOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_ORIGIN;

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_SITE_ORIGIN;
    }

    url.username = "";
    url.password = "";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}
export function siteOrigin(): string {
  return configuredOrigin();
}

export function encodePathSegment(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase());
}

export function absoluteUrl(pathOrUrl: string): string {
  try {
    const absolute = new URL(pathOrUrl);
    if (absolute.protocol === "http:" || absolute.protocol === "https:") {
      return absolute.toString();
    }
  } catch {
    // Resolve relative public paths below.
  }

  const path = `/${pathOrUrl.replace(/^\/+/, "")}`;
  return `${siteOrigin()}${path === "/" ? "" : path}`;
}

export function safeAbsoluteUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value, siteOrigin());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function recipeUrl(slug: string): string {
  return absoluteUrl(`/recipes/${encodePathSegment(slug)}`);
}

export function categoryUrl(slug: string, page = 1): string {
  const url = new URL(`/categories/${encodePathSegment(slug)}`, siteOrigin());
  if (Number.isSafeInteger(page) && page > 1) url.searchParams.set("page", String(page));
  return url.toString();
}

export function publicListingUrl(pathname: "/" | "/recipes" | "/categories" | "/search"): string {
  return absoluteUrl(pathname);
}

export const DEFAULT_RECIPE_OG_IMAGE = "/og/recipe-default.svg";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
