import axiosClient from "./axiosClient";
import { isApiProblemError } from "./problemDetails";
import type { ApiResponse, SearchRecipesParams } from "@/types/api.types";
import type {
  PagedResult,
  RecipeDetailDto,
  RecipeSummaryDto,
  SearchRecipeSummaryDto,
} from "@/types/recipe.types";
import { mockRecipes } from "../mock-data";

const mockModeEnabled =
  process.env.NODE_ENV === "development"
  && process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true";

type LegacyPagedRecipes = { items: RecipeSummaryDto[] };
export type PublicRecipeListParams = {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  difficulty?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

async function getAll(params?: PublicRecipeListParams): Promise<RecipeSummaryDto[]> {
  try {
    const response = await axiosClient.get<
      PagedResult<RecipeSummaryDto> | LegacyPagedRecipes | RecipeSummaryDto[]
    >("/api/v1/recipes", { params });
    if (Array.isArray(response.data)) return response.data;
    if ("data" in response.data && Array.isArray(response.data.data)) return response.data.data;
    if ("items" in response.data && Array.isArray(response.data.items)) return response.data.items;
    if (!mockModeEnabled) throw new Error("API returned an unexpected recipe list response.");
  } catch (error) {
    if (!mockModeEnabled) throw error;
  }

  let recipes = mockRecipes.filter((recipe) => recipe.status === 1);
  if (params?.categoryId) {
    recipes = recipes.filter((recipe) => recipe.categoryId === params.categoryId);
  }
  return recipes;
}

export const recipePublicApi = {
  async getPaged(params: PublicRecipeListParams = {}): Promise<PagedResult<RecipeSummaryDto>> {
    const response = await axiosClient.get<PagedResult<RecipeSummaryDto>>(
      "/api/v1/recipes",
      { params },
    );
    return response.data;
  },

  async search(params: SearchRecipesParams): Promise<ApiResponse<PagedResult<SearchRecipeSummaryDto>>> {
    const response = await axiosClient.get<ApiResponse<PagedResult<SearchRecipeSummaryDto>>>(
      "/api/v1/recipes/search",
      { params },
    );
    return response.data;
  },

  getAll,

  async getBySlug(slug: string): Promise<RecipeDetailDto | null> {
    try {
      const response = await axiosClient.get<RecipeDetailDto>(`/api/v1/recipes/${slug}`);
      return response.data;
    } catch (error) {
      if (isApiProblemError(error) && error.status === 404) return null;
      if (!mockModeEnabled) throw error;
    }

    return mockRecipes.find((recipe) => recipe.slug.toLowerCase() === slug.toLowerCase()) ?? null;
  },

  async getByCategory(categoryId: string): Promise<RecipeSummaryDto[]> {
    return getAll({ categoryId });
  },

  async getFeatured(): Promise<RecipeSummaryDto | null> {
    const recipes = await getAll();
    return recipes[0] ?? null;
  },
};
