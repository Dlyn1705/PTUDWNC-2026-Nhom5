"use client";

import { useAuth } from "@/hooks/useAuth";

export function usePermission() {
  const { user, isAdmin, isAuthor, isAuthenticated, isInitializing } = useAuth();

  const canModifyRecipe = (authorId?: string) =>
    !!user && (isAdmin || (isAuthor && user.id === authorId));

  return {
    user,
    role: isAdmin ? "Admin" : isAuthor ? "Author" : undefined,
    isAdmin,
    isAuthor,
    canModifyRecipe,
    isAuthenticated,
    isLoading: isInitializing,
  };
}
