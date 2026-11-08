import test from "node:test";
import assert from "node:assert/strict";
import {
  getPaginationItems,
  buildPaginationLinks,
  sanitizePageNumber,
  sanitizeTotalPages,
} from "../lib/pagination";
import { validCorrelationId } from "../lib/logger";
import { ServerApiError } from "../lib/api/serverClient";
import { errorPresentation } from "../lib/errorPresentation";
import { navigationItemIsActive, primaryNavigation } from "../components/layout/navigation";

test("shared navigation marks only the matching route branch as active", () => {
  assert.equal(navigationItemIsActive("/recipes", "/recipes"), true);
  assert.equal(navigationItemIsActive("/recipes/pho-bo", "/recipes"), true);
  assert.equal(navigationItemIsActive("/search", "/recipes"), false);
  assert.deepEqual(primaryNavigation.map(item => item.href), ["/recipes", "/categories"]);
});

test("error presentation keeps correlation without exposing backend text and separates permission failures", () => {
  for (const status of [400, 401, 403, 404, 422, 429, 500, 503]) {
    const value = errorPresentation(new ServerApiError(status, "SECRET backend stack", "request-id"));
    assert.equal(value.status, status);
    assert.equal(value.correlationId, "request-id");
    assert.ok(!value.description.includes("SECRET"));
    assert.equal(value.canRetry, [429, 500, 503].includes(status));
  }
  assert.equal(errorPresentation({ response: { status: 403, data: { correlationId: "body-id" } } }).correlationId, "body-id");
  assert.equal(errorPresentation({ correlationId: "bad id", digest: "not-a-correlation" }).correlationId, undefined);
  assert.equal(errorPresentation(new TypeError("SECRET")).canRetry, true);
});

test("pagination links never target pages outside the response range", () => {
  const links = buildPaginationLinks(getPaginationItems(99, 3), 99, 3, p => `/search?page=${p}&q=pho`);
  assert.deepEqual(links.map(link => link.page), [1, 2, 3]);
});

test("sanitizePageNumber and sanitizeTotalPages handle invalid inputs cleanly", () => {
  // Page number sanitization
  assert.equal(sanitizePageNumber(NaN), 1);
  assert.equal(sanitizePageNumber(Infinity), 1);
  assert.equal(sanitizePageNumber(-5), 1);
  assert.equal(sanitizePageNumber(0), 1);
  assert.equal(sanitizePageNumber(3.7), 3);
  assert.equal(sanitizePageNumber("4"), 4);
  assert.equal(sanitizePageNumber("invalid"), 1);

  // Total pages sanitization
  assert.equal(sanitizeTotalPages(NaN), 0);
  assert.equal(sanitizeTotalPages(Infinity), 0);
  assert.equal(sanitizeTotalPages(-1), 0);
  assert.equal(sanitizeTotalPages(0), 0);
  assert.equal(sanitizeTotalPages(10.8), 10);
  assert.equal(sanitizeTotalPages("12"), 12);
  assert.equal(sanitizeTotalPages("abc"), 0);
});

test("getPaginationItems returns empty when totalPages <= 1", () => {
  assert.deepEqual(getPaginationItems(1, 0), []);
  assert.deepEqual(getPaginationItems(1, 1), []);
  assert.deepEqual(getPaginationItems(0, 1), []);
  assert.deepEqual(getPaginationItems(-1, -5), []);
  assert.deepEqual(getPaginationItems(NaN, NaN), []);
});

test("getPaginationItems returns all pages when totalPages <= 7", () => {
  assert.deepEqual(getPaginationItems(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(getPaginationItems(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("getPaginationItems handles start, middle, and end with ellipsis for totalPages > 7", () => {
  // Near beginning
  const startItems = getPaginationItems(1, 10);
  assert.deepEqual(startItems, [1, 2, 3, 4, "ellipsis-end", 10]);

  // Middle
  const middleItems = getPaginationItems(5, 10);
  assert.deepEqual(middleItems, [1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 10]);

  // Near end
  const endItems = getPaginationItems(10, 10);
  assert.deepEqual(endItems, [1, "ellipsis-start", 7, 8, 9, 10]);
});

test("getPaginationItems handles massive totalPages without memory explosion", () => {
  const massiveItems = getPaginationItems(500000, 1000000);
  assert.ok(massiveItems.length <= 9);
  assert.equal(massiveItems[0], 1);
  assert.equal(massiveItems[massiveItems.length - 1], 1000000);
  assert.ok(massiveItems.includes(500000));
  assert.ok(massiveItems.includes("ellipsis-start"));
  assert.ok(massiveItems.includes("ellipsis-end"));
});

test("getPaginationItems handles out of range current page gracefully", () => {
  // Current page beyond total
  const beyondItems = getPaginationItems(20, 10);
  assert.ok(beyondItems.length > 0);
  assert.ok(!beyondItems.includes(20)); // defensive bounds
  assert.equal(beyondItems[beyondItems.length - 1], 10);

  // Current page negative
  const negativeItems = getPaginationItems(-5, 10);
  assert.deepEqual(negativeItems, [1, 2, 3, 4, "ellipsis-end", 10]);
});

test("buildPaginationLinks generates correct hrefs and includes prev/next links", () => {
  const items = getPaginationItems(3, 10);
  const links = buildPaginationLinks(items, 3, 10, (p) => `/search?page=${p}`);

  const pagesInLinks = links.map((l) => l.page);
  // Must include current - 1 (2) and current + 1 (4)
  assert.ok(pagesInLinks.includes(2));
  assert.ok(pagesInLinks.includes(3));
  assert.ok(pagesInLinks.includes(4));
  assert.ok(pagesInLinks.includes(1));
  assert.ok(pagesInLinks.includes(10));

  // Must have correct href
  const page3 = links.find((l) => l.page === 3);
  assert.equal(page3?.href, "/search?page=3");
});

test("ServerApiError holds status, message, and optional correlationId", () => {
  const errorWithId = new ServerApiError(500, "Internal Server Error", "req-12345");
  assert.equal(errorWithId.status, 500);
  assert.equal(errorWithId.message, "Internal Server Error");
  assert.equal(errorWithId.correlationId, "req-12345");

  const errorWithoutId = new ServerApiError(404, "Not Found");
  assert.equal(errorWithoutId.status, 404);
  assert.equal(errorWithoutId.correlationId, undefined);
});

test("ServerApiError preserves RFC 7807 fields and validation errors", () => {
  const error = new ServerApiError(422, "Validation failed", "req-422", {
    type: "https://example.test/problems/validation",
    title: "Validation error",
    detail: "Please correct the highlighted fields.",
    code: "VALIDATION_FAILED",
    errors: { title: ["Title is required"] },
  });

  assert.equal(error.type, "https://example.test/problems/validation");
  assert.equal(error.title, "Validation error");
  assert.equal(error.detail, "Please correct the highlighted fields.");
  assert.equal(error.code, "VALIDATION_FAILED");
  assert.deepEqual(error.errors, { title: ["Title is required"] });
});

test("validCorrelationId filters out malformed or overly long IDs", () => {
  assert.equal(validCorrelationId("req_123.abc-456"), "req_123.abc-456");
  assert.equal(validCorrelationId(""), undefined);
  assert.equal(validCorrelationId(null), undefined);
  assert.equal(validCorrelationId(undefined), undefined);
  assert.equal(validCorrelationId("has spaces"), undefined);
  assert.equal(validCorrelationId("x".repeat(129)), undefined);
  assert.equal(validCorrelationId("x".repeat(128)), "x".repeat(128));
  assert.equal(validCorrelationId("<script>alert(1)</script>"), undefined);
});
