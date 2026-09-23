import axiosClient from "./axiosClient";
import { RecipeDto, PagedResult } from "@/types/recipe.types";
import { mockRecipes } from "../mock-data";

export const recipeApi = {
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
