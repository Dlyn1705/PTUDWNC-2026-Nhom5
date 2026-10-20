import axiosClient from "./axiosClient";
import type { ApiResponse, PaginationMeta, SearchRecipesParams } from "../../types/api.types";
import type { PagedResult, RecipeDetailDto, RecipeSummaryDto, SearchRecipeSummaryDto } from "../../types/recipe.types";

const recipesPath = "/api/v1/recipes";

export type PublicRecipeFilters = {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  difficulty?: number;
  sortBy?: "createdAt" | "title" | "cookTime";
  sortOrder?: "asc" | "desc";
};

function pageParams(params: PublicRecipeFilters = {}) {
  return {
    ...params,
    page: Math.max(1, Math.floor(params.page ?? 1)),
    pageSize: Math.min(50, Math.max(1, Math.floor(params.pageSize ?? 12))),
    sortBy: params.sortBy ?? "createdAt",
    sortOrder: params.sortOrder ?? "desc",
  };
}

export async function getPaged(params: PublicRecipeFilters = {}): Promise<PagedResult<RecipeSummaryDto>> {
  const response = await axiosClient.get<PagedResult<RecipeSummaryDto>>(recipesPath, {
    params: pageParams(params),
  });
  return response.data;
}

export async function search(params: SearchRecipesParams): Promise<PagedResult<SearchRecipeSummaryDto>> {
  const q = params.q.trim();
  if (q.length < 2) {
    throw new Error("Từ khóa tìm kiếm phải có ít nhất 2 ký tự.");
  }
  const response = await axiosClient.get<PagedResult<SearchRecipeSummaryDto>>(`${recipesPath}/search`, {
    params: {
      ...params,
      q,
      page: Math.max(1, Math.floor(params.page ?? 1)),
      pageSize: Math.min(50, Math.max(1, Math.floor(params.pageSize ?? 12))),
      sortBy: params.sortBy ?? "relevance",
      sortOrder: params.sortOrder ?? "desc",
    },
  });
  return response.data;
}

/** The backend decides whether the caller may see a non-Published recipe. */
export async function getBySlug(slug: string): Promise<RecipeDetailDto> {
  const response = await axiosClient.get<ApiResponse<RecipeDetailDto>>(
    `${recipesPath}/${encodeURIComponent(slug)}`,
  );
  return response.data.data;
}

export type { PaginationMeta };

export const recipePublicApi = { getPaged, search, getBySlug };

