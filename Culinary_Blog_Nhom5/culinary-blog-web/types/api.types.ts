export interface ApiResponse<T> {
  success: boolean;
  message?: string | null;
  data: T;
}

export interface ApiError {
  status?: number;
  title?: string;
  detail?: string;
  message?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SearchRecipesParams {
  q: string;
  page?: number;
  pageSize?: number;
  categoryId?: string;
  difficulty?: number;
  minCookTime?: number;
  maxCookTime?: number;
  minServings?: number;
  maxServings?: number;
  sortBy?: "relevance" | "createdAt" | "title" | "cookTime";
  sortOrder?: "asc" | "desc";
}
