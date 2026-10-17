"use client";

import { useSession } from "next-auth/react";
import { useAuthStore } from "@/store/useAuthStore";

export function usePermission() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const { isAdmin, isAuthor, isAuthenticated, isLoading } = useAuthStore();

  const canModifyRecipe = (authorId?: string) =>
    !!user && (isAdmin || (isAuthor && user.id === authorId));

  return {
    user,
    role: user?.role,
    isAdmin,
    isAuthor,
    canModifyRecipe,
    isAuthenticated: isAuthenticated && status === "authenticated" && !session?.error,
    isLoading: isLoading || status === "loading",
  };
}
