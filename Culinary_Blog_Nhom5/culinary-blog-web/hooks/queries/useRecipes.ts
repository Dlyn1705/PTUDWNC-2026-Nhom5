"use client";

import { useQuery } from "@tanstack/react-query";
import { recipeApi } from "@/lib/api/recipeApi";
import { recipeKeys } from "./recipeKeys";

export function useManagedRecipes(status?: number) {
  return useQuery({
    queryKey: recipeKeys.managed(status),
    queryFn: () => recipeApi.getMine({ status }),
  });
}
export function useRecipe(id: string) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () => recipeApi.getById(id),
    enabled: Boolean(id),
  });
}
