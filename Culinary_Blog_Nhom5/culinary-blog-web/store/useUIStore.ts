"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export interface UIState {
  dashboardNavigationCollapsed: boolean;
  hasHydrated: boolean;
  setDashboardNavigationCollapsed(collapsed: boolean): void;
  setHasHydrated(hydrated: boolean): void;
}

const serverStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function defaultStorage(): StateStorage {
  return typeof window === "undefined" ? serverStorage : window.localStorage;
}

/**
 * Factory is exported for deterministic hydration tests. The application store
 * defers persisted-state reads until UIStoreHydrator runs after client mount.
 */
export function createUIStore(storage: StateStorage = defaultStorage()) {
  return create<UIState>()(
    persist(
      (set) => ({
        dashboardNavigationCollapsed: false,
        hasHydrated: false,
        setDashboardNavigationCollapsed: (dashboardNavigationCollapsed) =>
          set({ dashboardNavigationCollapsed }),
        setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      }),
      {
        name: "culinary-ui",
        version: 1,
        storage: createJSONStorage(() => storage),
        skipHydration: true,
        partialize: (state) => ({
          dashboardNavigationCollapsed: state.dashboardNavigationCollapsed,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
      },
    ),
  );
}

export const useUIStore = createUIStore();
