"use client";

import { useEffect, useRef, useState } from "react";
import { uploadRecipeImage, type RecipeImageDto } from "@/lib/api/fileApi";

export function useFileUpload(recipeId: string) {
  const controller = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);

  const upload = async (file: File, altText?: string): Promise<RecipeImageDto> => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setProgress(0);
    setIsUploading(true);
    try {
      return await uploadRecipeImage(
        recipeId,
        file,
        (value) => { if (controller.current === active) setProgress(value); },
        active.signal,
        altText,
      );
    } finally {
      // A canceled upload must not clear the next upload's controller/progress.
      if (controller.current === active) {
        setIsUploading(false);
        controller.current = null;
      }
    }
  };

  return {
    upload,
    cancel: () => controller.current?.abort(),
    progress,
    isUploading,
  };
}
