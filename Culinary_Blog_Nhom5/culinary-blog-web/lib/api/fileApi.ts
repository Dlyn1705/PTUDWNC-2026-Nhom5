import axiosClient from "./axiosClient";

export type RecipeImageDto = {
  id: string;
  recipeId: string;
  originalUrl: string;
  mediumUrl: string | null;
  thumbnailUrl: string | null;
  altText: string | null;
  isPrimary: boolean;
  orderIndex: number;
  processingStatus: "Pending" | "Processing" | "Completed" | "Failed";
};

type ApiResponse<T> = { success: boolean; message: string | null; data: T };

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
      headers: { "Content-Type": "multipart/form-data" },
      signal,
      timeout: 120_000,
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
