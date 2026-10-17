import type { DifficultyValue, RecipeStatusValue } from "./recipe.types";

/** Wire contract for MinIO image endpoints; distinct from a recipe card image. */
export interface StoredRecipeImage {
  id: string;
  recipeId: string;
  originalUrl: string;
  mediumUrl: string | null;
  thumbnailUrl: string | null;
  altText: string | null;
  isPrimary: boolean;
  orderIndex: number;
  processingStatus: "Pending" | "Processing" | "Completed" | "Failed";
}

export interface RecipeStateResponse {
  id: string;
  status: RecipeStatusValue;
  publishedAt: string | null;
  updatedAt?: string | null;
}

export interface PublicRecipeParams {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  difficulty?: DifficultyValue;
  maxCookTime?: number;
  sortBy?: "createdAt" | "title" | "cookTime";
  sortOrder?: "asc" | "desc";
}

export interface ApiProblem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: Record<string, string[]>;
  code?: string;
}
