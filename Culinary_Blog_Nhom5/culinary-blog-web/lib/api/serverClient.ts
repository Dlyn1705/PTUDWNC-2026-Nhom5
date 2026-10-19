import "server-only";

import type { ApiResponse } from "@/types/api.types";
import type { CategoryDetailResult, CategoryDto } from "@/types/category.types";
import type {
  PagedResult,
  RecipeDetailDto,
  RecipeSummaryDto,
  SearchRecipeSummaryDto,
} from "@/types/recipe.types";
import type { SearchRecipesParams } from "@/types/api.types";

const backendBaseUrl =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:5156";
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

export class ServerApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServerApiError";
  }
}

type ServerRequestOptions = Omit<RequestInit, "cache"> & {
  cache?: RequestCache;
  revalidate?: number | false;
  tags?: string[];
  searchParams?: Record<string, string | number | undefined>;
};

export async function serverClient<T>(
  path: string,
  options: ServerRequestOptions = {},
): Promise<T> {
  const { revalidate, tags, searchParams, ...init } = options;
  const url = new URL(path, backendBaseUrl);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init.headers },
    next:
      revalidate === undefined && !tags
        ? undefined
        : { revalidate, tags },
  });

  if (!response.ok) {
    throw new ServerApiError(
      response.status,
      `Backend request failed (${response.status}) for ${url.pathname}.`,
    );
  }

  return (await response.json()) as T;
}

export const publicApi = {
  async getCategories(): Promise<CategoryDto[]> {
    try {
      const response = await serverClient<ApiResponse<CategoryDto[]>>(
        "/api/v1/categories",
        { revalidate: 300, tags: ["categories"] },
      );
      return response.data;
    } catch (error) {
      if (isProductionBuild) return [];
      throw error;
    }
  },

  async getCategory(
    slug: string,
    page = 1,
    pageSize = 12,
  ): Promise<CategoryDetailResult | null> {
    try {
      const response = await serverClient<{
        data: Omit<CategoryDetailResult, "meta">;
        meta: CategoryDetailResult["meta"];
      }>(`/api/v1/categories/${encodeURIComponent(slug)}`, {
        revalidate: 300,
        tags: ["categories", `category:${slug}`],
        searchParams: { page, pageSize },
      });
      return { ...response.data, meta: response.meta };
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 404) return null;
      throw error;
    }
  },

  async getRecipes(
    params: Record<string, string | number | undefined> = {},
  ): Promise<PagedResult<RecipeSummaryDto>> {
    try {
      return await serverClient<PagedResult<RecipeSummaryDto>>("/api/v1/recipes", {
        revalidate: 120,
        tags: ["recipes"],
        searchParams: params,
      });
    } catch (error) {
      if (isProductionBuild) {
        const page = Number(params.page ?? 1);
        const pageSize = Number(params.pageSize ?? 12);
        return {
          data: [],
          meta: {
            page,
            pageSize,
            totalCount: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        };
      }
      throw error;
    }
  },

  async getRecipe(slug: string): Promise<RecipeDetailDto | null> {
    try {
      return await serverClient<RecipeDetailDto>(
        `/api/v1/recipes/${encodeURIComponent(slug)}`,
        { cache: "no-store" },
      );
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 404) return null;
      throw error;
    }
  },

  async searchRecipes(
    params: SearchRecipesParams,
  ): Promise<ApiResponse<PagedResult<SearchRecipeSummaryDto>>> {
    return serverClient<ApiResponse<PagedResult<SearchRecipeSummaryDto>>>(
      "/api/v1/recipes/search",
      { revalidate: 60, tags: ["recipe-search"], searchParams: { ...params } },
    );
  },
};
