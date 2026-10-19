import type { AxiosInstance } from "axios";
import type { ApiResponse } from "../../types/api.types";
import type { RecipeStateResponse } from "../../types/recipe-management.types";
import axiosClient from "./axiosClient";

export type RecipeLifecycleAction = "publish" | "unpublish" | "archive" | "unarchive";

export function createRecipeLifecycleApi(client: AxiosInstance) {
  async function change(id: string, action: RecipeLifecycleAction, signal?: AbortSignal) {
    const response = await client.patch<ApiResponse<RecipeStateResponse>>(
      `/api/v1/recipes/${encodeURIComponent(id)}/${action}`,
      undefined,
      { signal },
    );
    return response.data.data;
  }

  return {
    publish: (id: string, signal?: AbortSignal) => change(id, "publish", signal),
    unpublish: (id: string, signal?: AbortSignal) => change(id, "unpublish", signal),
    archive: (id: string, signal?: AbortSignal) => change(id, "archive", signal),
    unarchive: (id: string, signal?: AbortSignal) => change(id, "unarchive", signal),
    change,
  };
}

export type RecipeLifecycleApi = ReturnType<typeof createRecipeLifecycleApi>;
export const recipeLifecycleApi = createRecipeLifecycleApi(axiosClient);
