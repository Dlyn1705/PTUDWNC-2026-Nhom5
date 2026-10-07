import axiosClient from "./axiosClient";
import { RecipeDto, PagedResult } from "@/types/recipe.types";
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
        if ("items" in response.data && Array.isArray(response.data.items)) {
          return response.data.items;
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

  async getByCategory(categoryId: string): Promise<RecipeDto[]> {
    return this.getAll({ categoryId });
  },

  async getFeatured(): Promise<RecipeDto | null> {
    const recipes = await this.getAll();
    return recipes[0] || mockRecipes[0];
  },
};
