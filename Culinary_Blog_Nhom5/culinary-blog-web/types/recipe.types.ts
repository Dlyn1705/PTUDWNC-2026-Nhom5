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
  carbs: number;
  fat: number;
  fiber?: number;
  sodium: number;
}

export interface RecipeStepDto {
  id: string;
  order: number;
  title?: string;
  text: string;
  imageUrl?: string;
  timerMinutes?: number;
}

export interface RecipeIngredientDto {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
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
}
