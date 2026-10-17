"use client";

import { create } from "zustand";
import type { Session } from "next-auth";

export type AuthUiStatus = "loading" | "authenticated" | "unauthenticated";
export type AppRole = "Admin" | "Author";

export interface AuthUiState {
  status: AuthUiStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  userId?: string;
  role?: AppRole;
  roles: AppRole[];
  isAdmin: boolean;
  isAuthor: boolean;
  syncFromSession(session: Session | null, status: AuthUiStatus): void;
  clear(): void;
}

const unauthenticatedState = {
  status: "unauthenticated" as const,
  isAuthenticated: false,
  isLoading: false,
  userId: undefined,
  role: undefined,
  roles: [] as AppRole[],
  isAdmin: false,
  isAuthor: false,
};

function rolesFromSession(session: Session): AppRole[] {
  return (session.user.roles ?? []).filter(
    (role): role is AppRole => role === "Admin" || role === "Author",
  );
}

/**
 * UI-only projection of Auth.js session data. Tokens, cookies, credentials and
 * the full session intentionally never enter this store or browser persistence.
 */
export const useAuthStore = create<AuthUiState>()((set) => ({
  ...unauthenticatedState,
  syncFromSession: (session, status) => {
    if (status === "loading") {
      set({ status: "loading", isLoading: true });
      return;
    }

    if (!session?.user || session.error) {
      set(unauthenticatedState);
      return;
    }

    const roles = rolesFromSession(session);
    const role = session.user.role === "Admin" || session.user.role === "Author"
      ? session.user.role
      : roles[0];
    set({
      status: "authenticated",
      isAuthenticated: true,
      isLoading: false,
      userId: session.user.id,
      role,
      roles,
      isAdmin: roles.includes("Admin") || role === "Admin",
      isAuthor: roles.includes("Author") || role === "Author",
    });
  },
  clear: () => set(unauthenticatedState),
}));
