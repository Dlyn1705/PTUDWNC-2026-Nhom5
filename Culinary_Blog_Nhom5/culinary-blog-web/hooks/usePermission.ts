"use client";

import { hasRole } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";

export function usePermission() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const isAdmin = hasRole(user, "Admin");
  const isAuthor = hasRole(user, "Author");

  const canModifyRecipe = (authorId?: string) =>
    !!user && (isAdmin || (isAuthor && user.id === authorId));

  return {
    user,
    role: user?.role,
    isAdmin,
    isAuthor,
    canModifyRecipe,
    isAuthenticated,
    isLoading,
  };
}
