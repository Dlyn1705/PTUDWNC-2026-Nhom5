"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { categoryApi } from "@/lib/api/categoryApi";
import type { CreateCategoryDto, UpdateCategoryDto } from "@/types/category.types";
import { categoryKeys } from "../queries/categoryKeys";

export function useCategoryMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: categoryKeys.all });

  const create = useMutation({
    mutationFn: (payload: CreateCategoryDto) => categoryApi.create(payload),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCategoryDto }) =>
      categoryApi.update(id, payload),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: categoryApi.delete,
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
