import type { PublicRecipeParams } from "./recipePublicApi";
import { recipeLifecycleApi } from "./recipeLifecycleApi";
import { recipePublicApi } from "./recipePublicApi";

/** @deprecated Import recipePublicApi.getPaged directly. */
export function listPublicRecipes(params: PublicRecipeParams = {}, signal?: AbortSignal) {
  return recipePublicApi.getPaged(params, signal);
}

export type RecipeAction = "publish" | "unpublish" | "archive" | "unarchive";

/** @deprecated Import the named function from recipeLifecycleApi directly. */
export function changeRecipeState(id: string, action: RecipeAction, signal?: AbortSignal) {
  return recipeLifecycleApi.change(id, action, signal);
}

export { recipeLifecycleApi, recipePublicApi };
