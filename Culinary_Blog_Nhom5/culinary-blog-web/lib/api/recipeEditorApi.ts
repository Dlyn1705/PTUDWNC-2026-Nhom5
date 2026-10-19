import type { AxiosInstance } from "axios";
import type { ApiResponse } from "../../types/api.types";
import type {
  CreateRecipeNutritionRequest,
  CreateRecipeRequest,
  ManagedRecipesPage,
  RecipeDetailDto,
  RecipeMutationResponse,
  RecipeWritePayload,
} from "../../types/recipe.types";
import axiosClient from "./axiosClient";

export interface ManagedRecipeParams {
  page?: number;
  pageSize?: number;
  status?: number;
  sortBy?: string;
}

export function createRecipeEditorApi(client: AxiosInstance) {
  return {
    /** Authenticated Owner/Admin extension documented by the system specification. */
    async getMine(params: ManagedRecipeParams = {}): Promise<ManagedRecipesPage> {
      const response = await client.get<ManagedRecipesPage>("/api/v1/recipes/mine", {
        params: { page: 1, pageSize: 12, ...params },
      });
      return response.data;
    },

    /** Uses the explicit management route so a GUID is never interpreted as a public slug. */
    async getById(id: string): Promise<RecipeDetailDto> {
      const response = await client.get<ApiResponse<RecipeDetailDto>>(
        `/api/v1/recipes/by-id/${encodeURIComponent(id)}`,
      );
      return response.data.data;
    },

    async create(payload: CreateRecipeRequest): Promise<RecipeMutationResponse> {
      const response = await client.post<ApiResponse<RecipeMutationResponse>>(
        "/api/v1/recipes",
        payload,
      );
      return response.data.data;
    },

    async update(id: string, payload: RecipeWritePayload): Promise<RecipeMutationResponse> {
      const response = await client.put<ApiResponse<RecipeMutationResponse>>(
        `/api/v1/recipes/${encodeURIComponent(id)}`,
        payload,
      );
      return response.data.data;
    },

    async updateNutrition(
      id: string,
      payload: CreateRecipeNutritionRequest,
    ): Promise<RecipeDetailDto["nutrition"]> {
      const response = await client.put<ApiResponse<RecipeDetailDto["nutrition"]>>(
        `/api/v1/recipes/${encodeURIComponent(id)}/nutrition`,
        payload,
      );
      return response.data.data;
    },

    async delete(id: string): Promise<void> {
      await client.delete(`/api/v1/recipes/${encodeURIComponent(id)}`);
    },
  };
}

export type RecipeEditorApi = ReturnType<typeof createRecipeEditorApi>;
export const recipeEditorApi = createRecipeEditorApi(axiosClient);
