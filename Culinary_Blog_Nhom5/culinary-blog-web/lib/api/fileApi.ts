import axiosClient from "./axiosClient";

import type { StoredRecipeImage as RecipeImageDto } from "@/types/recipe-management.types";
import type { ApiResponse } from "@/types/api.types";
export type { StoredRecipeImage as RecipeImageDto } from "@/types/recipe-management.types";

export async function uploadRecipeImage(
  recipeId: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
  altText?: string,
) {
  const form = new FormData();
  form.append("file", file);
  if (altText?.trim()) form.append("altText", altText.trim());

  const response = await axiosClient.post<ApiResponse<RecipeImageDto>>(
    `/api/v1/recipes/${recipeId}/images`,
    form,
    {
      // Override axiosClient's JSON default; the browser supplies the multipart boundary.
      signal,
      timeout: 120_000,
      headers: { "Content-Type": undefined },
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
      },
    },
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.message || "Không thể tải ảnh lên.");
  }
  return response.data.data;
}

export async function getRecipeImageStatus(recipeId: string, imageId: string, signal?: AbortSignal) {
  const response = await axiosClient.get<ApiResponse<RecipeImageDto>>(
    `/api/v1/recipes/${recipeId}/images/${imageId}`, { signal },
  );
  if (!response.data.success || !response.data.data) throw new Error("Không đọc được trạng thái ảnh.");
  return response.data.data;
}
export async function deleteRecipeImage(recipeId: string, imageId: string) {
  await axiosClient.delete(`/api/v1/recipes/${recipeId}/images/${imageId}`);
}

export async function getRecipeImages(recipeId: string, signal?: AbortSignal): Promise<RecipeImageDto[]> {
  const response = await axiosClient.get<ApiResponse<RecipeImageDto[]>>(
    `/api/v1/recipes/${recipeId}/images`, { signal });
  if (!response.data.success || !Array.isArray(response.data.data)) throw new Error("Không thể tải ảnh.");
  return response.data.data;
}

export async function setRecipeImagePrimary(recipeId: string, imageId: string) {
  const response = await axiosClient.patch<ApiResponse<RecipeImageDto>>(
    `/api/v1/recipes/${recipeId}/images/${imageId}/primary`);
  return response.data.data;
}
