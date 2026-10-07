"use client";

import { useSession } from "next-auth/react";

export function usePermission() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const isAdmin = user?.role === "Admin";
  const isAuthor = user?.role === "Author";

  const canModifyRecipe = (authorId?: string) =>
    !!user && (isAdmin || (isAuthor && user.id === authorId));

  return {
    user,
    role: user?.role,
    isAdmin,
    isAuthor,
    canModifyRecipe,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
  };
}
