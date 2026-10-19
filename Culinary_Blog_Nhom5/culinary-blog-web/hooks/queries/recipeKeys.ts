export const recipeKeys = {
  all: ["recipes"] as const,
  lists: () => [...recipeKeys.all, "list"] as const,
  managed: (status?: number) => [...recipeKeys.all, "managed", status ?? "all"] as const,
  detail: (id: string) => [...recipeKeys.all, "detail", id] as const,
};
