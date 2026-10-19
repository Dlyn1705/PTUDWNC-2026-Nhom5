import axiosClient from "./axiosClient";
import { createFileApi } from "./fileApiCore";

export type { StoredRecipeImage as RecipeImageDto } from "../../types/recipe-management.types";
export const { uploadRecipeImage, waitForRecipeImage, getRecipeImageStatus, getRecipeImages, deleteRecipeImage, setRecipeImagePrimary } = createFileApi(axiosClient);
