"use client";

import { create } from "zustand";
import type { AppRole } from "@/types/auth";

type AuthProjection = {
  status: "loading" | "authenticated" | "unauthenticated";
  userId: string | null;
  displayName: string | null;
  roles: AppRole[];
  isAuthenticated: boolean;
};

type AuthState = AuthProjection & {
  syncFromSession: (session: { user?: { id?: string; name?: string | null; roles?: AppRole[] }; error?: string } | null, status: AuthProjection["status"]) => void;
  clear: () => void;
};

const empty: AuthProjection = {
  status: "unauthenticated", userId: null, displayName: null, roles: [], isAuthenticated: false,
};

export const useAuthStore = create<AuthState>((set) => ({
  ...empty,
  syncFromSession: (session, status) => {
    if (status !== "authenticated" || !session?.user || session.error === "RefreshTokenError") {
      set({ ...empty, status });
      return;
    }
    set({
      status,
      userId: session.user.id ?? null,
      displayName: session.user.name ?? null,
      roles: session.user.roles ?? [],
      isAuthenticated: true,
    });
  },
  clear: () => set(empty),
}));

export const selectIsAdmin = (state: AuthState) => state.roles.includes("Admin");
export const selectIsAuthor = (state: AuthState) => state.roles.includes("Author") || state.roles.includes("Admin");

