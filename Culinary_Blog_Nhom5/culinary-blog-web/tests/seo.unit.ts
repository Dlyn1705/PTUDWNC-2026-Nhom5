import test from "node:test";
import assert from "node:assert/strict";
import { buildCategoryMetadata, buildRecipeMetadata } from "../lib/seo/metadata";
import { categoryCanonical, listingCanonical } from "../lib/seo/canonical";
import { buildRecipeJsonLd, serializeJsonLd } from "../lib/seo/recipeJsonLd";
import { buildSeoDescription, buildSeoTitle } from "../lib/seo/text";
import type { RecipeDetailDto } from "../types/recipe.types";

const recipe = {
  id: "recipe-1",
  title: "Phở bò gia truyền với hành nướng và thảo mộc tươi",
  slug: "pho-bo-gia-truyen",
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-02T10:00:00.000Z",
  publishedAt: "2026-11-01T10:00:00.000Z",
  description: "Một bát phở thơm, trong vị và đủ sâu cho bữa sáng cuối tuần của cả gia đình.",
  prepTimeMinutes: 30,
  cookTimeMinutes: 120,
  servings: 4,
  difficulty: 2,
  status: 1,
  categoryId: "category-1",
  categoryName: "Món Việt",
  categorySlug: "mon-viet",
  author: { id: "author-1", displayName: "Linh", avatarUrl: null, bio: null },
  images: [{ id: "image-1", url: "https://cdn.example.test/pho.jpg", isPrimary: true, alt: "Phở bò" }],
  nutrition: { calories: 520, protein: 32, carbohydrates: 48, fat: 18, fiber: null, sodium: 860 },
  ingredients: [
    { id: "ingredient-1", name: "Bánh phở", quantity: null, unit: null, orderIndex: 0 },
    { id: "ingredient-2", name: "Thịt bò", quantity: 250, unit: "g", orderIndex: 1 },
  ],
  steps: [
    { id: "step-2", order: 2, stepNumber: 2, title: "Ninh nước dùng", text: "Ninh xương trong hai giờ.", imageUrl: null },
    { id: "step-1", order: 1, stepNumber: 1, title: "Nướng hành", text: "Nướng hành đến khi thơm.", imageUrl: null },
  ],
} as const;
const recipeFixture = recipe as unknown as RecipeDetailDto;

test("SEO title and description are normalized without splitting a word", () => {
  assert.ok(Array.from(buildSeoTitle("a ".repeat(80))).length <= 60);
  assert.ok(buildSeoTitle("Món ăn ngắn").endsWith("| Culinary Blog"));
  assert.ok(Array.from(buildSeoDescription("b ".repeat(120), "fallback")).length <= 160);
  assert.equal(buildSeoDescription("", "fallback description"), "fallback description");
});
test("canonical policy keeps page 1 clean and page 2 explicit", () => {
  assert.equal(categoryCanonical("Món Việt", 1), "https://culinaryblog.local/categories/m%C3%B3n%20vi%E1%BB%87t");
  assert.equal(categoryCanonical("mon-viet", 2), "https://culinaryblog.local/categories/mon-viet?page=2");
  assert.equal(listingCanonical("/search"), "https://culinaryblog.local/search");
});

test("Recipe JSON-LD maps nullable ingredient fields and ordered steps", () => {
  const jsonLd = buildRecipeJsonLd(recipeFixture);
  assert.equal(jsonLd["@type"], "Recipe");
  assert.equal(jsonLd.url, "https://culinaryblog.local/recipes/pho-bo-gia-truyen");
  assert.deepEqual(jsonLd.recipeIngredient, ["Bánh phở", "250 g Thịt bò"]);
  assert.deepEqual(
    (jsonLd.recipeInstructions as Array<Record<string, unknown>>).map((step) => step.name),
    ["Nướng hành", "Ninh nước dùng"],
  );
  assert.deepEqual(jsonLd.nutrition, {
    "@type": "NutritionInformation",
    calories: "520 calories",
    proteinContent: "32 grams",
    carbohydrateContent: "48 grams",
    fatContent: "18 grams",
    sodiumContent: "860 milligrams",
  });
});

test("serialized JSON-LD is safe for an inline script", () => {
  const unsafe = { ...buildRecipeJsonLd(recipeFixture), description: "</script><script>alert(1)</script>" };
  const serialized = serializeJsonLd(unsafe);
  assert.equal(serialized.includes("</script>"), false);
  assert.equal(serialized.includes("\\u003c/script\\u003e"), true);
});

test("recipe and category metadata expose canonical, OG and noindex policy", () => {
  const recipeMetadata = buildRecipeMetadata(recipeFixture);
  assert.equal(recipeMetadata.alternates?.canonical, "https://culinaryblog.local/recipes/pho-bo-gia-truyen");
  assert.equal((recipeMetadata.robots as { index?: boolean }).index, true);
  assert.equal((recipeMetadata.openGraph as { type?: string }).type, "article");
  const ogImages = (recipeMetadata.openGraph as { images?: Array<{ width?: number }> }).images ?? [];
  assert.equal(ogImages[0]?.width, 1200);

  const draftMetadata = buildRecipeMetadata({ ...recipeFixture, status: 0 });
  assert.equal((draftMetadata.robots as { index?: boolean; follow?: boolean }).index, false);
  assert.equal((draftMetadata.robots as { index?: boolean; follow?: boolean }).follow, false);

  const categoryMetadata = buildCategoryMetadata({
    id: "category-1",
    name: "Món Việt",
    slug: "mon-viet",
    description: "Các món Việt truyền thống.",
    imageUrl: null,
    orderIndex: 1,
    recipeCount: 4,
  }, 2);
  assert.equal(categoryMetadata.alternates?.canonical, "https://culinaryblog.local/categories/mon-viet?page=2");
  assert.equal((categoryMetadata.robots as { index?: boolean }).index, true);
});
