export const MAX_SEO_TITLE_LENGTH = 60;
export const MIN_SEO_DESCRIPTION_LENGTH = 150;
export const MAX_SEO_DESCRIPTION_LENGTH = 160;

export function cleanSeoText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}
export function truncateAtWord(value: string, maxLength: number): string {
  const clean = cleanSeoText(value);
  if (Array.from(clean).length <= maxLength) return clean;
  if (maxLength <= 1) return "…".slice(0, maxLength);

  const characters = Array.from(clean);
  const candidate = characters.slice(0, maxLength - 1).join("").trimEnd();
  const boundary = candidate.lastIndexOf(" ");
  const shortened = boundary >= Math.floor(candidate.length * 0.6)
    ? candidate.slice(0, boundary)
    : candidate;
  return `${shortened.trimEnd()}…`;
}

export function buildSeoTitle(title: string | null | undefined, fallback = "Culinary Blog"): string {
  const cleanTitle = cleanSeoText(title) || fallback;
  return truncateAtWord(`${cleanTitle} | Culinary Blog`, MAX_SEO_TITLE_LENGTH);
}

export function buildSeoDescription(
  description: string | null | undefined,
  fallback: string,
): string {
  return truncateAtWord(cleanSeoText(description) || fallback, MAX_SEO_DESCRIPTION_LENGTH);
}
