"use client";

import { useQuery } from "@tanstack/react-query";
import { categoryApi } from "@/lib/api/categoryApi";
import { categoryKeys } from "./categoryKeys";

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.lists(),
    queryFn: categoryApi.getAll,
  });
}
