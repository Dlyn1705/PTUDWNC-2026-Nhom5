"use client";

import { useRef, useState } from "react";
import { uploadRecipeImage, type RecipeImageDto } from "@/lib/api/fileApi";

export function useFileUpload(recipeId: string) {
  const controller = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const upload = async (file: File, altText?: string): Promise<RecipeImageDto> => {
    controller.current?.abort();
    controller.current = new AbortController();
    setProgress(0);
    setIsUploading(true);
    try {
      return await uploadRecipeImage(
        recipeId,
        file,
        setProgress,
        controller.current.signal,
        altText,
      );
    } finally {
      setIsUploading(false);
      controller.current = null;
    }
  };

  return {
    upload,
    cancel: () => controller.current?.abort(),
    progress,
    isUploading,
  };
}
