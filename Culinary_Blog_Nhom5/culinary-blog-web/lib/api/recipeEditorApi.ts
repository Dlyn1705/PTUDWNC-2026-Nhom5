import axiosClient from "./axiosClient";
import type { ApiResponse } from "../../types/api.types";
import type {
  CreateRecipeRequest,
  ManagedRecipesPage,
  RecipeDetailDto,
  RecipeMutationResponse,
  RecipeNutritionDto,
  RecipeWritePayload,
} from "../../types/recipe.types";
import { recipePublicApi } from "./recipePublicApi";

const recipesPath = "/api/v1/recipes";

export type RecipeNutritionPayload = Pick<RecipeNutritionDto, "calories" | "protein" | "carbohydrates" | "fat" | "fiber" | "sodium">;

export async function create(payload: CreateRecipeRequest): Promise<RecipeMutationResponse> {
  const response = await axiosClient.post<ApiResponse<RecipeMutationResponse>>(recipesPath, payload);
  return response.data.data;
}

export async function update(id: string, payload: RecipeWritePayload): Promise<RecipeMutationResponse> {
  const response = await axiosClient.put<ApiResponse<RecipeMutationResponse>>(
    `${recipesPath}/${encodeURIComponent(id)}`,
    payload,
  );
  return response.data.data;
}

export async function updateNutrition(id: string, payload: RecipeNutritionPayload): Promise<RecipeMutationResponse> {
  const response = await axiosClient.put<ApiResponse<RecipeMutationResponse>>(
    `${recipesPath}/${encodeURIComponent(id)}/nutrition`,
    payload,
  );
  return response.data.data;
}

export async function remove(id: string): Promise<void> {
  await axiosClient.delete(`${recipesPath}/${encodeURIComponent(id)}`);
}

/**
 * @deprecated Temporary owner/dashboard adapter. The endpoint is private and
 * must be removed when the documented owner-list contract replaces it.
 */
export async function getMine(params: { page?: number; pageSize?: number; status?: number; sortBy?: string } = {}): Promise<ManagedRecipesPage> {
  const response = await axiosClient.get<ManagedRecipesPage>(`${recipesPath}/mine`, {
    params: { page: Math.max(1, params.page ?? 1), pageSize: Math.min(50, Math.max(1, params.pageSize ?? 50)), ...params },
  });
  return response.data;
}

/**
 * @deprecated Resolve an owner record to its slug, then use the canonical
 * public-by-slug detail route. Never send an ID to the {slug} route.
 */
export async function getById(id: string): Promise<RecipeDetailDto> {
  let page = 1;
  while (true) {
    const result = await getMine({ page, pageSize: 50 });
    const match = result.data.find((recipe) => recipe.id === id);
    if (match) return recipePublicApi.getBySlug(match.slug);
    if (!result.meta.hasNextPage) break;
    page += 1;
  }
  throw new Error("Không tìm thấy công thức yêu cầu.");
}

export const recipeEditorApi = { create, update, updateNutrition, delete: remove, getMine, getById };

