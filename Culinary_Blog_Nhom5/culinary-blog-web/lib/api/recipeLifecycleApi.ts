import axiosClient from "./axiosClient";
import type { RecipeLifecycleResponse } from "@/types/recipe.types";

async function changeLifecycle(
  id: string,
  action: "archive" | "restore" | "publish" | "unpublish",
): Promise<RecipeLifecycleResponse> {
  const response = await axiosClient.post<RecipeLifecycleResponse>(
    `/api/v1/recipes/${id}/${action}`,
  );
  return response.data;
}

export const recipeLifecycleApi = {
  async delete(id: string): Promise<void> {
    await axiosClient.delete(`/api/v1/recipes/${id}`);
  },

  archive: (id: string) => changeLifecycle(id, "archive"),
  restore: (id: string) => changeLifecycle(id, "restore"),
  publish: (id: string) => changeLifecycle(id, "publish"),
  unpublish: (id: string) => changeLifecycle(id, "unpublish"),
};
