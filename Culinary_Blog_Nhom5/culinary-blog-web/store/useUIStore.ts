"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type RecipesViewMode = "grid" | "list";

interface UIState {
  recipesViewMode: RecipesViewMode;
  setRecipesViewMode: (mode: RecipesViewMode) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      recipesViewMode: "grid",
      setRecipesViewMode: (recipesViewMode) => set({ recipesViewMode }),
    }),
    {
      name: "culinary-ui",
      partialize: (state) => ({ recipesViewMode: state.recipesViewMode }),
    },
  ),
);
