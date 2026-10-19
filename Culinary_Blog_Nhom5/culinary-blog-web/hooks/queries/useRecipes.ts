"use client";

import { useQuery } from "@tanstack/react-query";
import { recipeEditorApi } from "@/lib/api/recipeEditorApi";
import type { ManagedRecipeParams } from "@/lib/api/recipeEditorApi";
import { recipeKeys } from "./recipeKeys";

export function useManagedRecipes(params: ManagedRecipeParams = {}) {
  return useQuery({
    queryKey: recipeKeys.managed(params),
    queryFn: () => recipeEditorApi.getMine(params),
  });
}
export function useRecipe(id: string) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () => recipeEditorApi.getById(id),
    enabled: Boolean(id),
  });
}
