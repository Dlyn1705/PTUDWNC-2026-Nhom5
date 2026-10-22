"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { hasRole } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";

export function useAuth() {
  const { data: session, status } = useSession();
  const syncSession = useAuthStore((state) => state.syncSession);
  const storeUser = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    syncSession(session);
  }, [session, syncSession]);

  const user = session?.error ? null : session?.user ?? storeUser;
  const isAuthenticated = status === "authenticated" && !!user && !session?.error;
  const isAdmin = hasRole(user, "Admin");
  const isAuthor = hasRole(user, "Author");

  return {
    user,
    accessToken: user?.accessToken ?? accessToken ?? undefined,
    isAuthenticated,
    isLoading: status === "loading",
    error: session?.error,
    role: user?.role,
    roles: user?.roles ?? [],
    isAdmin,
    isAuthor,
    login,
    logout,
  };
}
