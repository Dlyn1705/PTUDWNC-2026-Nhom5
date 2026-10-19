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
import { validCorrelationId } from "../logger";

const backendBaseUrl =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:5156";
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

export interface ServerProblemDetails {
  type?: string;
  title?: string;
  detail?: string;
  message?: string;
  code?: string;
  correlationId?: string;
  errors?: Record<string, string[]>;
}

function readServerProblem(value: unknown): ServerProblemDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const problem: ServerProblemDetails = {};

  for (const key of ["type", "title", "detail", "message", "code", "correlationId"] as const) {
    if (typeof source[key] === "string") problem[key] = source[key];
  }

  if (source.errors && typeof source.errors === "object" && !Array.isArray(source.errors)) {
    problem.errors = Object.fromEntries(
      Object.entries(source.errors).filter(
        (entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every((item) => typeof item === "string"),
      ),
    );
  }

  return problem;
}

export class ServerApiError extends Error {
  public readonly type?: string;
  public readonly title?: string;
  public readonly detail?: string;
  public readonly code?: string;
  public readonly errors: Record<string, string[]>;

  constructor(
    public readonly status: number,
    message: string,
    public readonly correlationId?: string,
    details: ServerProblemDetails = {},
  ) {
    super(message);
    this.name = "ServerApiError";
    this.type = details.type;
    this.title = details.title;
    this.detail = details.detail ?? message;
    this.code = details.code;
    this.errors = details.errors ?? {};
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
    const rawHeaderId =
      response.headers.get("x-correlation-id") ||
      response.headers.get("x-request-id") ||
      undefined;
    let correlationId = validCorrelationId(rawHeaderId);
    let message = `Backend request failed (${response.status}) for ${url.pathname}.`;
    let problem: ServerProblemDetails = {};

    try {
      const cloned = response.clone();
      problem = readServerProblem(await cloned.json());
      if (!correlationId && problem.correlationId) {
        correlationId = validCorrelationId(problem.correlationId);
      }
      if (problem.detail?.trim()) {
        message = problem.detail.trim();
      } else if (problem.title?.trim()) {
        message = problem.title.trim();
      } else if (problem.message?.trim()) {
        message = problem.message.trim();
      }
    } catch {
      // Body parse error must not lose response status or break failure flow
    }

    throw new ServerApiError(response.status, message, correlationId, {
      ...problem,
      correlationId,
    });
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
