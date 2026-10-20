"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect } from "react";

type RecipesViewMode = "grid" | "list";

interface UIState {
  recipesViewMode: RecipesViewMode;
  hasHydrated: boolean;
  setRecipesViewMode: (mode: RecipesViewMode) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set): UIState => ({
      recipesViewMode: "grid",
      hasHydrated: false,
      setRecipesViewMode: (recipesViewMode) => set({ recipesViewMode }),
    }),
    {
      name: "culinary-ui",
      partialize: (state) => ({ recipesViewMode: state.recipesViewMode }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => state?.hasHydrated !== true && useUIStore.setState({ hasHydrated: true }),
    },
  ),
);

export function useUIHydration() {
  const hasHydrated = useUIStore((state) => state.hasHydrated);
  useEffect(() => {
    if (!useUIStore.persist.hasHydrated()) void useUIStore.persist.rehydrate();
  }, []);
  return hasHydrated;
}
