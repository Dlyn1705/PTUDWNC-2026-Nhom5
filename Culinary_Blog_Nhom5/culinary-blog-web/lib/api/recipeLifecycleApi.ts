import axiosClient from "./axiosClient";
import type { ApiResponse } from "../../types/api.types";
import type { RecipeStateResponse } from "../../types/recipe-management.types";

const recipesPath = "/api/v1/recipes";
export type RecipeLifecycleAction = "publish" | "unpublish" | "archive" | "unarchive";

async function transition(id: string, action: RecipeLifecycleAction): Promise<RecipeStateResponse> {
  const response = await axiosClient.patch<ApiResponse<RecipeStateResponse>>(
    `${recipesPath}/${encodeURIComponent(id)}/${action}`,
  );
  return response.data.data;
}

export const publish = (id: string) => transition(id, "publish");
export const unpublish = (id: string) => transition(id, "unpublish");
export const archive = (id: string) => transition(id, "archive");
export const unarchive = (id: string) => transition(id, "unarchive");

/** @deprecated Use unarchive; this alias never sends a /restore request. */
export const restore = unarchive;

export const recipeLifecycleApi = { publish, unpublish, archive, unarchive, restore };

