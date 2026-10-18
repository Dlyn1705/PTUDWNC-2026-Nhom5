import axiosClient from "./axiosClient";
import type { ManagedRecipesPage, RecipeDetailDto, RecipeSummaryDto, PagedResult, RecipeMutationResponse, RecipeWritePayload, CreateRecipeRequest } from "@/types/recipe.types";
import type { ApiResponse, SearchRecipesParams } from "@/types/api.types";
import type { SearchRecipeSummaryDto } from "@/types/recipe.types";
import { mockRecipes } from "../mock-data";

const mockModeEnabled =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true";

type LegacyPagedRecipes = { items: RecipeSummaryDto[] };

export const recipeApi = {
  async getMine(params: {
    page?: number;
    pageSize?: number;
    status?: number;
    sortBy?: string;
  } = {}): Promise<ManagedRecipesPage> {
    const response = await axiosClient.get<ManagedRecipesPage>("/api/v1/recipes/mine", { params });
    return response.data;
  },

  async getPaged(params: {
    page?: number;
    pageSize?: number;
    categoryId?: string;
    difficulty?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}): Promise<PagedResult<RecipeSummaryDto>> {
    const response = await axiosClient.get<PagedResult<RecipeSummaryDto>>("/api/v1/recipes", { params });
    return response.data;
  },

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
  }): Promise<RecipeSummaryDto[]> {
    try {
      const response = await axiosClient.get<PagedResult<RecipeSummaryDto> | LegacyPagedRecipes | RecipeSummaryDto[]>(
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

  async getBySlug(slug: string): Promise<RecipeDetailDto | null> {
    try {
      const response = await axiosClient.get<RecipeDetailDto>(`/api/v1/recipes/${slug}`);
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

  async getById(id: string): Promise<RecipeDetailDto> {
    const response = await axiosClient.get<RecipeDetailDto>(`/api/v1/recipes/${id}`);
    return response.data;
  },

  async create(payload: CreateRecipeRequest): Promise<RecipeMutationResponse> {
    const response = await axiosClient.post<ApiResponse<RecipeMutationResponse>>(
      "/api/v1/recipes/",
      payload,
    );
    return response.data.data;
  },

  async update(id: string, payload: RecipeWritePayload): Promise<RecipeMutationResponse> {
    const response = await axiosClient.put<ApiResponse<RecipeMutationResponse>>(
      `/api/v1/recipes/${id}`,
      payload,
    );
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await axiosClient.delete(`/api/v1/recipes/${id}`);
  },

  async getByCategory(categoryId: string): Promise<RecipeSummaryDto[]> {
    return this.getAll({ categoryId });
  },

  async getFeatured(): Promise<RecipeSummaryDto | null> {
    const recipes = await this.getAll();
    return recipes[0] || mockRecipes[0];
  },
};
