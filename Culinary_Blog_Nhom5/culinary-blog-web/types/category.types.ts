import type { PaginationMeta } from "./api.types";
import type { RecipeCardDto } from "./recipe.types";

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  orderIndex: number;
  recipeCount: number;
}

export interface CategoryDetailResult {
  category: CategoryDto;
  recipes: RecipeCardDto[];
  meta: PaginationMeta;
}

export interface CreateCategoryDto {
  name: string;
  description?: string;
  imageUrl?: string;
  orderIndex?: number;
}

export interface UpdateCategoryDto {
  name: string;
  description?: string;
  imageUrl?: string;
  orderIndex?: number;
}
