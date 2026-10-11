export const Difficulty = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
  Expert: 4,
} as const;
export type DifficultyValue = (typeof Difficulty)[keyof typeof Difficulty];

export interface CreateRecipeIngredientRequest {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  orderIndex?: number;
}

export interface CreateRecipeStepRequest {
  description: string;
  title?: string | null;
  timerMinutes?: number | null;
  imageUrl?: string | null;
}

export interface RecipeNutritionInput {
  calories?: number | null;
  protein?: number | null;
  carbohydrates?: number | null;
  fat?: number | null;
  fiber?: number | null;
  sodium?: number | null;
}

export interface CreateRecipeRequest {
  title: string;
  description?: string | null;
  instructions?: string | null;
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: DifficultyValue;
  categoryId: string;
  ingredients?: CreateRecipeIngredientRequest[];
  steps?: CreateRecipeStepRequest[];
  nutrition?: RecipeNutritionInput | null;
}

export type UpdateRecipeRequest = Omit<CreateRecipeRequest, "ingredients" | "steps"> & { rowVersion: string };

export interface RecipeMutationResponse {
  id: string;
  slug: string;
  message?: string;
}

export interface ManagedRecipeDto {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: RecipeStatusValue;
  updatedAt: string;
  category: { id: string; name: string } | null;
  author: { id: string; displayName: string } | null;
  primaryImageUrl?: string | null;
}

export interface ManagedRecipeDetailsDto extends UpdateRecipeRequest {
  id: string;
  slug: string;
  status: RecipeStatusValue;
  ingredients: RecipeIngredientDto[];
  steps: RecipeStepDto[];
  images: RecipeImageUploadDto[];
  nutrition?: RecipeNutritionDto | null;
}

export interface RecipeImageUploadDto {
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

export const RecipeStatus = {
  Draft: 0,
  Published: 1,
  Archived: 2,
} as const;
export type RecipeStatusValue = (typeof RecipeStatus)[keyof typeof RecipeStatus];

export const difficultyLabel: Record<DifficultyValue, string> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
  4: "Expert",
};

export const statusLabel: Record<RecipeStatusValue, string> = {
  0: "Draft",
  1: "Published",
  2: "Archived",
};

export interface AuthorDto {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
}

export interface RecipeImageDto {
  id: string;
  url: string;
  isPrimary: boolean;
  alt?: string | null;
}

export interface RecipeNutritionDto {
  calories: number;
  protein: number;
  carbohydrates?: number;
  carbs?: number; // legacy alias
  fat: number;
  fiber?: number | null;
  sodium: number;
}

export interface RecipeStepDto {
  id: string;
  stepNumber?: number;
  order: number;
  title?: string;
  description?: string;
  text: string;
  imageUrl?: string;
  timerMinutes?: number;
}

export interface RecipeIngredientDto {
  id: string;
  recipeId?: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  notes?: string;
  orderIndex?: number;
}

export interface RecipeCardDto {
  id: string;
  title: string;
  slug: string;
  createdAt: string;
  description: string;
  instructions?: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  difficulty: DifficultyValue;
  status: RecipeStatusValue;
  categoryId: string;
  categoryName?: string;
  categorySlug?: string;
  author: AuthorDto;
  images: RecipeImageDto[];
}

export interface RecipeDto extends RecipeCardDto {
  nutrition: RecipeNutritionDto;
  steps: RecipeStepDto[];
  ingredients: RecipeIngredientDto[];
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

export interface SearchRecipeSummaryDto {
  id: string;
  title: string;
  slug: string;
  description: string;
  primaryImageUrl?: string | null;
  category: { id: string; name: string; slug: string };
  author: AuthorDto;
  difficulty: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  relevanceScore: number;
  createdAt: string;
}
