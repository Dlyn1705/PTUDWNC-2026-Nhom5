import axiosClient from "./axiosClient";
import type { ApiResponse } from "../../types/api.types";
import type {
  CreateRecipeRequest,
  ManagedRecipesPage,
  RecipeDetailDto,
  RecipeMutationResponse,
  RecipeWritePayload,
} from "../../types/recipe.types";

const recipesPath = "/api/v1/recipes";

export type RecipeNutritionPayload = {
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
  rowVersion?: string;
};

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

/** Owner/Admin dashboard list. The API returns the standard data/meta envelope. */
export async function getMine(params: { page?: number; pageSize?: number; status?: number; sortBy?: string } = {}): Promise<ManagedRecipesPage> {
  const response = await axiosClient.get<ManagedRecipesPage | ApiResponse<ManagedRecipesPage>>(`${recipesPath}/mine`, {
    params: { page: Math.max(1, params.page ?? 1), pageSize: Math.min(50, Math.max(1, params.pageSize ?? 12)), ...params },
  });
  const value = response.data;
  return "meta" in value ? value : value.data;
}

/** Load an editable recipe directly by its ID. The backend authorizes owner/admin access. */
export async function getById(id: string): Promise<RecipeDetailDto> {
  const response = await axiosClient.get<RecipeDetailDto | ApiResponse<RecipeDetailDto>>(
    `${recipesPath}/${encodeURIComponent(id)}`,
  );
  const value = response.data;
  return "id" in value ? value : value.data;
}

export const recipeEditorApi = { create, update, updateNutrition, delete: remove, getMine, getById };

