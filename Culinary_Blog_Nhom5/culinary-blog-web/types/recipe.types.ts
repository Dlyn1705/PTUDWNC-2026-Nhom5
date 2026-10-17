export const Difficulty = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
  Expert: 4,
} as const;
export type DifficultyValue = (typeof Difficulty)[keyof typeof Difficulty];

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

export interface RecipeSummaryDto {
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
  rowVersion?: string;
}

export type RecipeCardDto = RecipeSummaryDto;

export interface RecipeDetailDto extends RecipeSummaryDto {
  nutrition: RecipeNutritionDto;
  steps: RecipeStepDto[];
  ingredients: RecipeIngredientDto[];
}

export type RecipeDto = RecipeDetailDto;

export interface PagedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface RecipeMutationResponse {
  message: string;
  id: string;
  slug: string;
  rowVersion: string;
}

export interface RecipeWritePayload {
  title: string;
  description?: string;
  instructions?: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: DifficultyValue;
  categoryId: string;
  rowVersion?: string;
}

export interface RecipeIngredientWritePayload {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
}

export interface RecipeStepWritePayload {
  title?: string | null;
  description: string;
  timerMinutes?: number | null;
}

export interface RecipeNutritionWritePayload {
  calories?: number | null;
  protein?: number | null;
  carbohydrates?: number | null;
  fat?: number | null;
  fiber?: number | null;
  sodium?: number | null;
}

export interface RecipeCreatePayload extends Omit<RecipeWritePayload, "rowVersion"> {
  ingredients?: RecipeIngredientWritePayload[];
  steps?: RecipeStepWritePayload[];
  nutrition?: RecipeNutritionWritePayload | null;
}

export interface RecipeLifecycleResponse {
  id: string;
  status: RecipeStatusValue;
  publishedAt?: string | null;
  updatedAt?: string | null;
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
