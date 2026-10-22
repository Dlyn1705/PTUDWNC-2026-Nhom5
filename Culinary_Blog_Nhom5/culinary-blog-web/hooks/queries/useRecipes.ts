"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { recipeEditorApi } from "@/lib/api/recipeEditorApi";
import { recipeKeys } from "./recipeKeys";

export function useManagedRecipes(status?: number, page = 1, pageSize = 12) {
  return useQuery({
    queryKey: [...recipeKeys.managed(status), { page, pageSize }],
    queryFn: () => recipeEditorApi.getMine({ status, page, pageSize }),
    placeholderData: keepPreviousData,
  });
}
export function useRecipe(id: string) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () => recipeEditorApi.getById(id),
    enabled: Boolean(id),
  });
}
