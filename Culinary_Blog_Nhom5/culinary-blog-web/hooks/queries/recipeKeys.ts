import type { ManagedRecipeParams } from "../../lib/api/recipeEditorApi";
import type { PublicRecipeParams } from "../../lib/api/recipePublicApi";

export const recipeKeys = {
  all: ["recipes"] as const,
  lists: () => [...recipeKeys.all, "list"] as const,
  publicList: (filters: PublicRecipeParams = {}) => [...recipeKeys.lists(), "public", filters] as const,
  managed: (filters: ManagedRecipeParams = {}) => [...recipeKeys.lists(), "managed", filters] as const,
  detail: (identifier: string) => [...recipeKeys.all, "detail", identifier] as const,
};
