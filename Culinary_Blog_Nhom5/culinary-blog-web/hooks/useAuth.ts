"use client";

import { selectIsAdmin, selectIsAuthor, useAuthStore } from "../store/authStore";

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const isAdmin = useAuthStore(selectIsAdmin);
  const isAuthor = useAuthStore(selectIsAuthor);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  return { user, isAuthenticated, isInitializing, isAuthor, isAdmin, login, logout };
}
