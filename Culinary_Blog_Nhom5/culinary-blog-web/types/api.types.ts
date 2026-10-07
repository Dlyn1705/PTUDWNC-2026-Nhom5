export interface ApiResponse<T> {
  success: boolean;
  message?: string | null;
  data: T;
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
