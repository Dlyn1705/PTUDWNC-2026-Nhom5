/** Backend image upload/status contract; public recipe cards use a separate image view model. */
export interface RecipeImageDto {
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
