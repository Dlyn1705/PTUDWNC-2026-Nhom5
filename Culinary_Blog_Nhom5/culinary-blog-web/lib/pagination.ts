export type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

export function sanitizePageNumber(value: unknown, fallback = 1): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Number.isNaN(value)) return fallback;
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback;
    return Math.max(1, parsed);
  }
  return fallback;
}

export function sanitizeTotalPages(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Number.isNaN(value) || value < 0) return 0;
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) return 0;
    return parsed;
  }
  return 0;
}

/**
 * Returns a compact list of page numbers and ellipsis tokens to render.
 * Avoids allocating large arrays when total is large.
 * Returns empty array when total <= 1 or invalid.
 */
export function getPaginationItems(
  current: number,
  total: number,
): PaginationItem[] {
  const safeTotal = sanitizeTotalPages(total);
  if (safeTotal <= 1) return [];

  const rawCurrent = sanitizePageNumber(current, 1);
  // Defensive clamp for window calculation while preserving page bounds
  const clampedCurrent = Math.min(Math.max(1, rawCurrent), safeTotal);

  if (safeTotal <= 7) {
    return Array.from({ length: safeTotal }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, safeTotal]);
  if (clampedCurrent > 1) pages.add(clampedCurrent - 1);
  pages.add(clampedCurrent);
  if (clampedCurrent < safeTotal) pages.add(clampedCurrent + 1);

  if (clampedCurrent <= 3) {
    [2, 3, 4].forEach((p) => {
      if (p <= safeTotal) pages.add(p);
    });
  }
  if (clampedCurrent >= safeTotal - 2) {
    [safeTotal - 3, safeTotal - 2, safeTotal - 1].forEach((p) => {
      if (p >= 1) pages.add(p);
    });
  }

  const sorted = [...pages].filter((p) => p >= 1 && p <= safeTotal).sort((a, b) => a - b);
  const result: PaginationItem[] = [];

  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) {
      result.push(index === 1 ? "ellipsis-start" : "ellipsis-end");
    }
    result.push(page);
  });

  return result;
}

export interface PaginationLinkItem {
  page: number;
  href: string;
}

/**
 * Builds array of { page, href } for all pages present in pagination items,
 * plus previous and next pages if within bounds.
 */
export function buildPaginationLinks(
  items: PaginationItem[],
  currentPage: number,
  totalPages: number,
  buildHref: (page: number) => string,
): PaginationLinkItem[] {
  const safeTotal = sanitizeTotalPages(totalPages);
  const safeCurrent = sanitizePageNumber(currentPage, 1);
  const pagesToInclude = new Set<number>();

  for (const item of items) {
    if (typeof item === "number" && item >= 1 && item <= safeTotal) {
      pagesToInclude.add(item);
    }
  }

  if (safeCurrent > 1 && safeCurrent - 1 <= safeTotal) {
    pagesToInclude.add(safeCurrent - 1);
  }
  if (safeCurrent < safeTotal) {
    pagesToInclude.add(safeCurrent + 1);
  }

  return [...pagesToInclude]
    .sort((a, b) => a - b)
    .map((page) => ({ page, href: buildHref(page) }));
}
