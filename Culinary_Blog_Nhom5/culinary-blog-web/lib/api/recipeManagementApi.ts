import { recipeLifecycleApi } from "./recipeLifecycleApi";
import { recipePublicApi } from "./recipePublicApi";
import type { PublicRecipeParams } from "../../types/recipe-management.types";

/** @deprecated Import recipePublicApi or recipeLifecycleApi directly. */
export const listPublicRecipes = (params: PublicRecipeParams = {}) => recipePublicApi.getPaged({
  page: params.page,
  pageSize: params.pageSize,
  categoryId: params.categoryId,
  difficulty: params.difficulty,
  sortBy: params.sortBy,
  sortOrder: params.sortOrder,
});

export type RecipeAction = "publish" | "unpublish" | "archive" | "unarchive";

/** @deprecated Compatibility alias; lifecycle actions use their canonical methods. */
export function changeRecipeState(id: string, action: RecipeAction) {
  return recipeLifecycleApi[action](id);
}
