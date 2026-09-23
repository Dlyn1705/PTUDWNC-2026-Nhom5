export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  orderIndex: number;
  recipeCount: number;
  avgCookTimeMinutes?: number | null;
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
