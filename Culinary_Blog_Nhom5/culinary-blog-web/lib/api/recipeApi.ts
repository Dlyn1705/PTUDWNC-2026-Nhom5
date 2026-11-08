import { recipePublicApi } from "./recipePublicApi";
import { recipeEditorApi } from "./recipeEditorApi";
import { recipeLifecycleApi } from "./recipeLifecycleApi";
import type { RecipeSummaryDto } from "../../types/recipe.types";

/** Compatibility facade; request implementations live in canonical modules. */
export const recipeApi = {
  getPaged: recipePublicApi.getPaged,
  search: recipePublicApi.search,
  getBySlug: recipePublicApi.getBySlug,
  create: recipeEditorApi.create,
  update: recipeEditorApi.update,
  updateNutrition: recipeEditorApi.updateNutrition,
  delete: recipeEditorApi.delete,
  getMine: recipeEditorApi.getMine,
  getById: recipeEditorApi.getById,
  getByCategory: async (categoryId: string) => (await recipePublicApi.getPaged({ categoryId })).data,
  /** @deprecated Use recipePublicApi.getPaged; this helper unwraps data for old callers. */
  getAll: async (params?: Parameters<typeof recipePublicApi.getPaged>[0]): Promise<RecipeSummaryDto[]> =>
    (await recipePublicApi.getPaged(params)).data,
  /** @deprecated No documented Featured endpoint; returns the first published catalog item. */
  getFeatured: async (): Promise<RecipeSummaryDto | null> => {
    const page = await recipePublicApi.getPaged({ page: 1, pageSize: 1 });
    return page.data[0] ?? null;
  },
  publish: recipeLifecycleApi.publish,
  unpublish: recipeLifecycleApi.unpublish,
  archive: recipeLifecycleApi.archive,
  unarchive: recipeLifecycleApi.unarchive,
  /** @deprecated Alias for unarchive; no /restore endpoint is used. */
  restore: recipeLifecycleApi.restore,
};

export { recipePublicApi, recipeEditorApi, recipeLifecycleApi };
