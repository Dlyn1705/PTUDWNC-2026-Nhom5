import axiosClient from "./axiosClient";
import type { PagedResult, RecipeCardDto } from "@/types/recipe.types";
import type { PublicRecipeParams, RecipeStateResponse } from "@/types/recipe-management.types";

const recipesPath = "/api/v1/recipes";

/** Keeps pagination metadata and surfaces API failures to the caller. */
export async function listPublicRecipes(params: PublicRecipeParams = {}, signal?: AbortSignal) {
  const response = await axiosClient.get<PagedResult<RecipeCardDto>>(recipesPath, { params, signal });
  return response.data;
}

export type RecipeAction = "publish" | "unpublish" | "archive" | "restore";

/** Browser calls reuse the session bearer token attached by axiosClient. */
export async function changeRecipeState(id: string, action: RecipeAction, signal?: AbortSignal) {
  const response = await axiosClient.post<RecipeStateResponse>(
    `${recipesPath}/${encodeURIComponent(id)}/${action}`, undefined, { signal },
  );
  return response.data;
}
