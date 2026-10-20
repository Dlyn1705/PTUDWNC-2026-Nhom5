"use client";

import { useQuery } from "@tanstack/react-query";
import { recipeEditorApi } from "@/lib/api/recipeEditorApi";
import { recipeKeys } from "./recipeKeys";

export function useManagedRecipes(status?: number) {
  return useQuery({
    queryKey: recipeKeys.managed(status),
    queryFn: () => recipeEditorApi.getMine({ status }),
  });
}
export function useRecipe(id: string) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () => recipeEditorApi.getById(id),
    enabled: Boolean(id),
  });
}
