import axiosClient from "./axiosClient";
import type { ApiResponse } from "@/types/api.types";
import type { ingredientPayload } from "@/lib/ingredient-form";

export type IngredientPayload = ReturnType<typeof ingredientPayload>;
export type IngredientDto = IngredientPayload & { id: string; recipeId: string; orderIndex: number };
const path = (recipeId: string) => `/api/v1/recipes/${recipeId}/ingredients`;
function version(headers: Record<string, unknown>): string {
  const etag = headers.etag;
  if (typeof etag !== "string" || !etag) throw new Error("Không nhận được version của công thức. Hãy tải lại.");
  return etag;
}

export const ingredientApi = {
  async list(recipeId: string, signal?: AbortSignal) {
    const response = await axiosClient.get<ApiResponse<IngredientDto[]>>(path(recipeId), { signal });
    return { items: response.data.data, etag: version(response.headers) };
  },
  async save(recipeId: string, id: string | undefined, item: IngredientPayload, etag: string) {
    const config = { headers: { "If-Match": etag } };
    const response = id
      ? await axiosClient.put<ApiResponse<IngredientDto>>(`${path(recipeId)}/${id}`, item, config)
      : await axiosClient.post<ApiResponse<IngredientDto>>(path(recipeId), item, config);
    return { item: response.data.data, etag: version(response.headers) };
  },
  async remove(recipeId: string, id: string, etag: string) {
    const response = await axiosClient.delete(`${path(recipeId)}/${id}`, { headers: { "If-Match": etag } });
    return version(response.headers);
  },
  async reorder(recipeId: string, ingredientIds: string[], etag: string) {
    const response = await axiosClient.put<ApiResponse<IngredientDto[]>>(`${path(recipeId)}/reorder`, { ingredientIds },
      { headers: { "If-Match": etag } });
    return { items: response.data.data, etag: version(response.headers) };
  },
};
