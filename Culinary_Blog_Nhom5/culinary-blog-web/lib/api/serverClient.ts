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

export interface ServerProblemDetails {
  type?: string;
  title?: string;
  detail?: string;
  message?: string;
  code?: string;
  status?: number;
  instance?: string;
  correlationId?: string;
  errors?: Record<string, string[]>;
}

function readServerProblem(value: unknown): ServerProblemDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const problem: ServerProblemDetails = {};

  for (const key of ["type", "title", "detail", "message", "code", "instance", "correlationId"] as const) {
    if (typeof source[key] === "string") problem[key] = source[key];
  }
  if (Number.isInteger(source.status) && Number(source.status) >= 100 && Number(source.status) <= 599) {
    problem.status = Number(source.status);
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
  public readonly instance?: string;
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
    this.instance = details.instance;
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

  const requestHeaders = new Headers(init.headers);
  if (!requestHeaders.has("Accept")) requestHeaders.set("Accept", "application/json");
  requestHeaders.set("X-Correlation-ID",
    validCorrelationId(requestHeaders.get("X-Correlation-ID") ?? undefined) ?? crypto.randomUUID());
  const response = await fetch(url, {
    ...init,
    headers: requestHeaders,
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
    const response = await serverClient<ApiResponse<CategoryDto[]>>(
      "/api/v1/categories",
      { cache: "no-store" },
    );
    return response.data;
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
        cache: "no-store",
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
    const result = await serverClient<PagedResult<RecipeSummaryDto>>("/api/v1/recipes", {
      cache: "no-store",
      searchParams: params,
    });
    // Defense in depth: a public page/sitemap must never expose a non-Published
    // item even if a backend fixture or proxy returns an invalid mixed page.
    return { ...result, data: result.data.filter((recipe) => recipe.status === 1) };
  },

  async getRecipe(slug: string): Promise<RecipeDetailDto | null> {
    try {
      const response = await serverClient<ApiResponse<RecipeDetailDto>>(
        `/api/v1/recipes/${encodeURIComponent(slug)}`,
        // The API owns the 60-minute Redis cache and invalidates it on every mutation.
        // Do not create a second Next.js cache that the API cannot invalidate.
        { cache: "no-store" },
      );
      return response.data.status === 1 ? response.data : null;
    } catch (error) {
      if (error instanceof ServerApiError && error.status === 404) return null;
      throw error;
    }
  },

  async searchRecipes(
    params: SearchRecipesParams,
  ): Promise<PagedResult<SearchRecipeSummaryDto>> {
    return serverClient<PagedResult<SearchRecipeSummaryDto>>(
      "/api/v1/recipes/search",
      { cache: "no-store", searchParams: { ...params } },
    ).then((result) => result);
  },
};
