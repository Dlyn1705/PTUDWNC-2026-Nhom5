import type { RecipeDetailDto, RecipeIngredientDto, RecipeStepDto } from "../../types/recipe.types";
import { recipeUrl, safeAbsoluteUrl, DEFAULT_RECIPE_OG_IMAGE, absoluteUrl } from "./siteUrl";

type JsonLdValue = string | number | boolean | null | undefined | JsonLdObject | JsonLdValue[];
export type JsonLdObject = { [key: string]: JsonLdValue };

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function isoDuration(minutes: unknown): string | undefined {
  const value = finiteNumber(minutes);
  if (value === null || value < 0) return undefined;
  return `PT${Math.round(value)}M`;
}

function optionalUnit(value: unknown, unit: string): string | undefined {
  const number = finiteNumber(value);
  return number === null ? undefined : `${number} ${unit}`;
}

function ingredientText(item: RecipeIngredientDto): string | null {
  const name = item.name?.replace(/\s+/gu, " ").trim();
  if (!name) return null;

  return [item.quantity, item.unit, name]
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
    .join(" ");
}

function orderedSteps(steps: RecipeStepDto[]): RecipeStepDto[] {
  return [...steps]
    .filter((step) => Boolean(step.text?.trim() || step.description?.trim() || step.title?.trim()))
    .sort((left, right) => (left.stepNumber ?? left.order) - (right.stepNumber ?? right.order));
}

export function buildRecipeJsonLd(recipe: RecipeDetailDto): JsonLdObject {
  const primaryImage = recipe.images?.find((image) => image.isPrimary)?.url
    ?? recipe.images?.[0]?.url;
  const image = safeAbsoluteUrl(primaryImage) ?? absoluteUrl(DEFAULT_RECIPE_OG_IMAGE);
  const steps = orderedSteps(recipe.steps ?? []);
  const ingredients = (recipe.ingredients ?? [])
    .slice()
    .sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0))
    .map(ingredientText)
    .filter((value): value is string => Boolean(value));

  const nutritionSource = recipe.nutrition as unknown as Record<string, unknown> | null | undefined;
  const carbohydrates = nutritionSource?.carbohydrates ?? nutritionSource?.carbs;
  const nutritionEntries = {
    calories: optionalUnit(nutritionSource?.calories, "calories"),
    proteinContent: optionalUnit(nutritionSource?.protein, "grams"),
    carbohydrateContent: optionalUnit(carbohydrates, "grams"),
    fatContent: optionalUnit(nutritionSource?.fat, "grams"),
    fiberContent: optionalUnit(nutritionSource?.fiber, "grams"),
    sodiumContent: optionalUnit(nutritionSource?.sodium, "milligrams"),
  };
  const nutrition = Object.fromEntries(
    Object.entries(nutritionEntries).filter(([, value]) => value !== undefined),
  );

  const totalTime = [recipe.prepTimeMinutes, recipe.cookTimeMinutes]
    .map(finiteNumber)
    .every((value) => value !== null)
    ? isoDuration((recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0))
    : undefined;

  const result: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "@id": `${recipeUrl(recipe.slug)}#recipe`,
    url: recipeUrl(recipe.slug),
    name: recipe.title.trim(),
    description: recipe.description.trim(),
    image: [image],
    author: {
      "@type": "Person",
      name: recipe.author?.displayName?.trim() || "Culinary Blog",
    },
    datePublished: recipe.publishedAt || recipe.createdAt,
    dateModified: recipe.updatedAt || recipe.publishedAt || recipe.createdAt,
    prepTime: isoDuration(recipe.prepTimeMinutes),
    cookTime: isoDuration(recipe.cookTimeMinutes),
    totalTime,
    recipeYield: recipe.servings > 0 ? `${recipe.servings} servings` : undefined,
    recipeCategory: recipe.categoryName?.trim() || undefined,
    recipeIngredient: ingredients,
    recipeInstructions: steps.map((step, index) => {
      const order = step.stepNumber ?? step.order ?? index + 1;
      const stepImage = safeAbsoluteUrl(step.imageUrl);
      return {
        "@type": "HowToStep",
        name: step.title?.trim() || `Step ${order}`,
        text: step.text?.trim() || step.description?.trim() || step.title?.trim() || `Step ${order}`,
        ...(stepImage ? { image: stepImage } : {}),
      };
    }),
    ...(Object.keys(nutrition).length > 0
      ? { nutrition: { "@type": "NutritionInformation", ...nutrition } }
      : {}),
  };

  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined && value !== null),
  ) as JsonLdObject;
}

export function serializeJsonLd(value: JsonLdObject): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
