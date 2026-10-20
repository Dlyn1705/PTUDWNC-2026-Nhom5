"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recipeEditorApi } from "@/lib/api/recipeEditorApi";
import { recipeLifecycleApi } from "@/lib/api/recipeLifecycleApi";
import type { CreateRecipeRequest, RecipeWritePayload } from "@/types/recipe.types";
import { recipeKeys } from "../queries/recipeKeys";

export function useRecipeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: recipeKeys.all });

  const create = useMutation({
    mutationFn: (payload: CreateRecipeRequest) =>
      recipeEditorApi.create(payload),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RecipeWritePayload }) =>
      recipeEditorApi.update(id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: recipeEditorApi.delete, onSuccess: invalidate });
  const publish = useMutation({
    mutationFn: (id: string) => recipeLifecycleApi.publish(id),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: (id: string) => recipeLifecycleApi.archive(id),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (id: string) => recipeLifecycleApi.unarchive(id),
    onSuccess: invalidate,
  });

  return { create, update, remove, publish, archive, restore };
}
