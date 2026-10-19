import { recipeEditorApi } from "./recipeEditorApi";
import { recipeLifecycleApi } from "./recipeLifecycleApi";
import { collectPublishedRecipes, recipePublicApi } from "./recipePublicApi";

/**
 * Transitional compatibility facade. Request implementations live in the
 * public, editor and lifecycle modules; new code should import those directly.
 */
export const recipeApi = {
  ...recipePublicApi,
  ...recipeEditorApi,
  publish: recipeLifecycleApi.publish,
  unpublish: recipeLifecycleApi.unpublish,
  archive: recipeLifecycleApi.archive,
  unarchive: recipeLifecycleApi.unarchive,

  /** @deprecated Use collectPublishedRecipes only for sitemap/export workflows. */
  getAll: collectPublishedRecipes,

  /** @deprecated Use getPaged({ page: 1, pageSize: 1 }) and name the UI intent explicitly. */
  async getFeatured() {
    const result = await recipePublicApi.getPaged({ page: 1, pageSize: 1 });
    return result.data[0] ?? null;
  },

  /** @deprecated UI alias; the canonical lifecycle action is unarchive. */
  restore: recipeLifecycleApi.unarchive,
};

export { recipeEditorApi } from "./recipeEditorApi";
export { recipeLifecycleApi } from "./recipeLifecycleApi";
export { collectPublishedRecipes, recipePublicApi } from "./recipePublicApi";
