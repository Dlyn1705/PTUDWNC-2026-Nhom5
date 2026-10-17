"use client";

import { useSession } from "next-auth/react";
import { hasRole } from "@/lib/permissions";

export function usePermission() {
  const { data: session, status } = useSession();
  const user = session?.error ? undefined : session?.user;
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
    isAuthenticated: status === "authenticated" && !session?.error,
    isLoading: status === "loading",
  };
}
