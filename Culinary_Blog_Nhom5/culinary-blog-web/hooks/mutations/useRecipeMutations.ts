"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recipeApi } from "@/lib/api/recipeApi";
import { changeRecipeState } from "@/lib/api/recipeManagementApi";
import type { CreateRecipeRequest, RecipeWritePayload } from "@/types/recipe.types";
import { recipeKeys } from "../queries/recipeKeys";

export function useRecipeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: recipeKeys.all });

  const create = useMutation({
    mutationFn: (payload: CreateRecipeRequest) =>
      recipeApi.create(payload),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RecipeWritePayload }) =>
      recipeApi.update(id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: recipeApi.delete, onSuccess: invalidate });
  const publish = useMutation({
    mutationFn: (id: string) => changeRecipeState(id, "publish"),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: (id: string) => changeRecipeState(id, "archive"),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (id: string) => changeRecipeState(id, "unarchive"),
    onSuccess: invalidate,
  });

  return { create, update, remove, publish, archive, restore };
}
