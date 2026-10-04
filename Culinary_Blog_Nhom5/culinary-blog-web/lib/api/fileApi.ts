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

function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

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
  let image = response.data.data;
  for (let attempt = 0; attempt < 30 && ["Pending", "Processing"].includes(image.processingStatus); attempt++) {
    await delay(1000, signal);
    const status = await axiosClient.get<ApiResponse<RecipeImageDto>>(
      `/api/v1/recipes/${recipeId}/images/${image.id}`,
      { signal },
    );
    image = status.data.data;
  }
  if (image.processingStatus === "Failed") throw new Error("Ảnh đã tải lên nhưng không thể tạo các kích thước xem trước.");
  return image;
}
