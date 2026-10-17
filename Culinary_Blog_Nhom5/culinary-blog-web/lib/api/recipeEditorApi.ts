import axiosClient from "./axiosClient";
import type {
  RecipeCreatePayload,
  RecipeDetailDto,
  RecipeMutationResponse,
  RecipeWritePayload,
} from "@/types/recipe.types";

export const recipeEditorApi = {
  async getById(id: string): Promise<RecipeDetailDto> {
    const response = await axiosClient.get<RecipeDetailDto>(`/api/v1/recipes/${id}`);
    return response.data;
  },

  async create(payload: RecipeCreatePayload): Promise<RecipeMutationResponse> {
    const response = await axiosClient.post<RecipeMutationResponse>("/api/v1/recipes/", payload);
    return response.data;
  },

  async update(id: string, payload: RecipeWritePayload): Promise<RecipeMutationResponse> {
    const response = await axiosClient.put<RecipeMutationResponse>(
      `/api/v1/recipes/${id}`,
      payload,
    );
    return response.data;
  },
};
