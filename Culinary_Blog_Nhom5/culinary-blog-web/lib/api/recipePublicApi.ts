import type { AxiosInstance } from "axios";
import type { ApiResponse, SearchRecipesParams } from "../../types/api.types";
import type {
  PagedResult,
  RecipeDetailDto,
  RecipeSummaryDto,
  SearchRecipeSummaryDto,
} from "../../types/recipe.types";
import { RecipeStatus } from "../../types/recipe.types";
import { mockRecipes } from "../mock-data";
import axiosClient from "./axiosClient";
import { ApiProblemError, toApiProblemError } from "./problemDetails";

export interface PublicRecipeParams {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  difficulty?: number;
  maxCookTime?: number;
  sortBy?: "createdAt" | "title" | "cookTime";
  sortOrder?: "asc" | "desc";
}

type PublicApiOptions = { enableMocks?: boolean };

const defaultOptions: PublicApiOptions = {
  enableMocks: process.env.NODE_ENV === "development"
    && process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true",
};

function normalizeParams(params: PublicRecipeParams = {}): Required<Pick<PublicRecipeParams,
  "page" | "pageSize" | "sortBy" | "sortOrder">> & PublicRecipeParams {
  return {
    ...params,
    page: Math.max(1, Math.trunc(params.page ?? 1)),
    pageSize: Math.min(50, Math.max(1, Math.trunc(params.pageSize ?? 12))),
    sortBy: params.sortBy ?? "createdAt",
    sortOrder: params.sortOrder ?? "desc",
  };
}

function mockPage(params: PublicRecipeParams): PagedResult<RecipeSummaryDto> {
  const normalized = normalizeParams(params);
  let recipes = mockRecipes.filter((recipe) => recipe.status === RecipeStatus.Published);
  if (normalized.categoryId) recipes = recipes.filter((recipe) => recipe.categoryId === normalized.categoryId);
  if (normalized.difficulty) recipes = recipes.filter((recipe) => recipe.difficulty === normalized.difficulty);
  const start = (normalized.page - 1) * normalized.pageSize;
  const totalPages = recipes.length === 0 ? 0 : Math.ceil(recipes.length / normalized.pageSize);
  return {
    data: recipes.slice(start, start + normalized.pageSize),
    meta: {
      page: normalized.page,
      pageSize: normalized.pageSize,
      totalCount: recipes.length,
      totalPages,
      hasNextPage: normalized.page < totalPages,
      hasPreviousPage: normalized.page > 1,
    },
  };
}

export function createRecipePublicApi(
  client: AxiosInstance,
  options: PublicApiOptions = {},
) {
  const enableMocks = options.enableMocks ?? false;
  return {
    async getPaged(
      params: PublicRecipeParams = {},
      signal?: AbortSignal,
    ): Promise<PagedResult<RecipeSummaryDto>> {
      const normalized = normalizeParams(params);
      try {
        const response = await client.get<PagedResult<RecipeSummaryDto>>("/api/v1/recipes", {
          params: normalized,
          signal,
        });
        return response.data;
      } catch (error) {
        if (enableMocks) return mockPage(normalized);
        throw toApiProblemError(error);
      }
    },

    async search(params: SearchRecipesParams): Promise<PagedResult<SearchRecipeSummaryDto>> {
      const q = params.q.trim();
      if (q.length < 2) {
        throw new ApiProblemError({
          status: 422,
          title: "Từ khóa tìm kiếm không hợp lệ.",
          errors: { q: ["Từ khóa tìm kiếm phải có ít nhất 2 ký tự."] },
        });
      }
      try {
        const response = await client.get<PagedResult<SearchRecipeSummaryDto>>(
          "/api/v1/recipes/search",
          { params: { ...params, q } },
        );
        return response.data;
      } catch (error) {
        throw toApiProblemError(error);
      }
    },

    async getBySlug(slug: string): Promise<RecipeDetailDto | null> {
      try {
        const response = await client.get<ApiResponse<RecipeDetailDto>>(
          `/api/v1/recipes/${encodeURIComponent(slug)}`,
        );
        return response.data.data;
      } catch (error) {
        const problem = toApiProblemError(error);
        if (problem.status === 404) return null;
        if (!enableMocks) throw problem;
        return mockRecipes.find((recipe) => recipe.status === RecipeStatus.Published
          && recipe.slug.toLowerCase() === slug.toLowerCase()) ?? null;
      }
    },

    async getByCategory(
      categoryId: string,
      params: Omit<PublicRecipeParams, "categoryId"> = {},
    ): Promise<PagedResult<RecipeSummaryDto>> {
      return this.getPaged({ ...params, categoryId });
    },
  };
}

export type RecipePublicApi = ReturnType<typeof createRecipePublicApi>;
export const recipePublicApi = createRecipePublicApi(axiosClient, defaultOptions);

export async function collectPublishedRecipes(
  api: Pick<RecipePublicApi, "getPaged"> = recipePublicApi,
): Promise<RecipeSummaryDto[]> {
  const published: RecipeSummaryDto[] = [];
  let page = 1;
  do {
    const result = await api.getPaged({ page, pageSize: 50, sortBy: "createdAt", sortOrder: "desc" });
    published.push(...result.data.filter((recipe) => recipe.status === RecipeStatus.Published));
    if (!result.meta.hasNextPage) break;
    page++;
  } while (page <= 1_000);
  return published;
}
