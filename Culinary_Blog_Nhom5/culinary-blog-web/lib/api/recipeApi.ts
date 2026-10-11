import axiosClient from "./axiosClient";
import { RecipeDto, PagedResult, CreateRecipeRequest, UpdateRecipeRequest, RecipeMutationResponse, CreateRecipeIngredientRequest, CreateRecipeStepRequest, RecipeImageUploadDto, ManagedRecipeDto, ManagedRecipeDetailsDto } from "@/types/recipe.types";
import type { ApiResponse } from "@/types/api.types";
import type { SearchRecipeSummaryDto } from "@/types/recipe.types";
import { mockRecipes } from "../mock-data";

export const recipeApi = {
  async getMine(params?: { page?: number; pageSize?: number; status?: number }): Promise<PagedResult<ManagedRecipeDto>> {
    const response = await axiosClient.get<PagedResult<ManagedRecipeDto>>("/api/v1/recipes/mine", { params });
    return response.data;
  },

  async getManagedById(id: string): Promise<ManagedRecipeDetailsDto> {
    const response = await axiosClient.get<ManagedRecipeDetailsDto>(`/api/v1/recipes/${id}/manage`);
    return response.data;
  },

  async create(payload: CreateRecipeRequest): Promise<RecipeMutationResponse> {
    const response = await axiosClient.post<RecipeMutationResponse>("/api/v1/recipes", payload);
    return response.data;
  },

  async update(id: string, payload: UpdateRecipeRequest): Promise<RecipeMutationResponse> {
    const response = await axiosClient.put<RecipeMutationResponse>(`/api/v1/recipes/${id}`, payload);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await axiosClient.delete(`/api/v1/recipes/${id}`);
  },

  async addIngredient(recipeId: string, payload: CreateRecipeIngredientRequest) {
    const response = await axiosClient.post(`/api/v1/recipes/${recipeId}/ingredients`, payload);
    return response.data;
  },

  async updateIngredient(recipeId: string, ingredientId: string, payload: CreateRecipeIngredientRequest) {
    const response = await axiosClient.put(`/api/v1/recipes/${recipeId}/ingredients/${ingredientId}`, payload);
    return response.data;
  },

  async deleteIngredient(recipeId: string, ingredientId: string): Promise<void> {
    await axiosClient.delete(`/api/v1/recipes/${recipeId}/ingredients/${ingredientId}`);
  },

  async addStep(recipeId: string, payload: CreateRecipeStepRequest) {
    const response = await axiosClient.post(`/api/v1/recipes/${recipeId}/steps`, payload);
    return response.data;
  },

  async updateStep(recipeId: string, stepId: string, payload: CreateRecipeStepRequest) {
    const response = await axiosClient.put(`/api/v1/recipes/${recipeId}/steps/${stepId}`, payload);
    return response.data;
  },

  async reorderSteps(recipeId: string, stepIds: string[]) {
    const response = await axiosClient.put(`/api/v1/recipes/${recipeId}/steps/reorder`, { stepIds });
    return response.data;
  },

  async deleteStep(recipeId: string, stepId: string): Promise<void> {
    await axiosClient.delete(`/api/v1/recipes/${recipeId}/steps/${stepId}`);
  },

  async uploadImage(recipeId: string, file: File, altText?: string): Promise<RecipeImageUploadDto> {
    const form = new FormData();
    form.append("file", file);
    if (altText) form.append("altText", altText);
    const response = await axiosClient.post<ApiResponse<RecipeImageUploadDto>>(`/api/v1/recipes/${recipeId}/images`, form);
    return response.data.data;
  },

  async setPrimaryImage(recipeId: string, imageId: string) {
    const response = await axiosClient.patch(`/api/v1/recipes/${recipeId}/images/${imageId}/primary`);
    return response.data;
  },

  async deleteImage(recipeId: string, imageId: string): Promise<void> {
    await axiosClient.delete(`/api/v1/recipes/${recipeId}/images/${imageId}`);
  },

  async search(params: {
    q: string;
    page?: number;
    pageSize?: number;
    categoryId?: string;
    difficulty?: number;
    sort?: string;
  }): Promise<ApiResponse<PagedResult<SearchRecipeSummaryDto>>> {
    const response = await axiosClient.get<ApiResponse<PagedResult<SearchRecipeSummaryDto>>>(
      "/api/v1/recipes/search",
      { params },
    );
    return response.data;
  },

  async getAll(params?: {
    page?: number;
    pageSize?: number;
    categoryId?: string;
    sortBy?: string;
  }): Promise<RecipeDto[]> {
    try {
      const response = await axiosClient.get<PagedResult<RecipeDto> | RecipeDto[]>(
        "/api/v1/recipes",
        { params },
      );
      if (response.data) {
        if (Array.isArray(response.data)) {
          return response.data;
        }
        if ("items" in response.data && Array.isArray(response.data.items)) {
          return response.data.items;
        }
      }
      return mockRecipes.filter((r) => r.status === 1);
    } catch {
      // Fallback for offline / dev mock mode
      let result = mockRecipes.filter((r) => r.status === 1);
      if (params?.categoryId) {
        result = result.filter((r) => r.categoryId === params.categoryId);
      }
      return result;
    }
  },

  async getBySlug(slug: string): Promise<RecipeDto | null> {
    try {
      const response = await axiosClient.get<RecipeDto>(`/api/v1/recipes/${slug}`);
      if (response.data) {
        return response.data;
      }
    } catch {
      // Fallback check in mock data
    }
    const found = mockRecipes.find((r) => r.slug.toLowerCase() === slug.toLowerCase());
    return found || null;
  },

  async getByCategory(categoryId: string): Promise<RecipeDto[]> {
    return this.getAll({ categoryId });
  },

  async getFeatured(): Promise<RecipeDto | null> {
    const recipes = await this.getAll();
    return recipes[0] || mockRecipes[0];
  },
};
