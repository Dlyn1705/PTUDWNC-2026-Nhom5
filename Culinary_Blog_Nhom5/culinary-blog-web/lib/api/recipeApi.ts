import { recipeEditorApi } from "./recipeEditorApi";
import { recipeLifecycleApi } from "./recipeLifecycleApi";
import { recipePublicApi } from "./recipePublicApi";

export { recipeEditorApi } from "./recipeEditorApi";
export { recipeLifecycleApi } from "./recipeLifecycleApi";
export { recipePublicApi } from "./recipePublicApi";

/**
 * Compatibility facade for existing imports. New code should import the
 * smallest domain module it needs.
 */
export const recipeApi = {
  ...recipePublicApi,
  ...recipeEditorApi,
  ...recipeLifecycleApi,
};
