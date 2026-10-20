export const recipeKeys = {
  all: ["recipes"] as const,
  lists: () => [...recipeKeys.all, "list"] as const,
  managed: (status?: number) => [...recipeKeys.all, "managed", status ?? "all"] as const,
  detail: (slug: string) => [...recipeKeys.all, "public-detail", slug] as const,
};
