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
