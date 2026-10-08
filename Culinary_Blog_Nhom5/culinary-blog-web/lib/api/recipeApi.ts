import axiosClient from "./axiosClient";
import { RecipeDto, PagedResult, RecipeMutationResponse, RecipeWritePayload } from "@/types/recipe.types";
import type { ApiResponse, SearchRecipesParams } from "@/types/api.types";
import type { SearchRecipeSummaryDto } from "@/types/recipe.types";
import { mockRecipes } from "../mock-data";

const mockModeEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true";

export const recipeApi = {
  async search(params: SearchRecipesParams): Promise<ApiResponse<PagedResult<SearchRecipeSummaryDto>>> {
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
        if ("data" in response.data && Array.isArray(response.data.data)) {
          return response.data.data;
        }
      }
      if (mockModeEnabled) return mockRecipes.filter((r) => r.status === 1);
      throw new Error("API returned an unexpected recipe list response.");
    } catch (error) {
      if (!mockModeEnabled) throw error;
      // Use sample data only when development mocks are explicitly enabled.
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
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      if (!mockModeEnabled) throw error;
      // Use sample data only when development mocks are explicitly enabled.
    }
    const found = mockRecipes.find((r) => r.slug.toLowerCase() === slug.toLowerCase());
    return found || null;
  },

  async getById(id: string): Promise<RecipeDto> {
    const response = await axiosClient.get<RecipeDto>(`/api/v1/recipes/${id}`);
    return response.data;
  },

  async create(payload: Omit<RecipeWritePayload, "rowVersion">): Promise<RecipeMutationResponse> {
    const response = await axiosClient.post<RecipeMutationResponse>(
      "/api/v1/recipes/",
      payload,
    );
    return response.data;
  },

  async update(id: string, payload: RecipeWritePayload): Promise<RecipeMutationResponse> {
    const response = await axiosClient.put<RecipeMutationResponse>(
      `/api/v1/recipes/${id}`,
      payload,
    );
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await axiosClient.delete(`/api/v1/recipes/${id}`);
  },

  async getByCategory(categoryId: string): Promise<RecipeDto[]> {
    return this.getAll({ categoryId });
  },

  async getFeatured(): Promise<RecipeDto | null> {
    const recipes = await this.getAll();
    return recipes[0] || mockRecipes[0];
  },
};
