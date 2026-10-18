"use client";

import type { ReactNode } from "react";
import { usePermission } from "@/hooks/usePermission";

import type { AppRole } from "@/types/auth";

interface CanProps {
  role?: AppRole;
  authorId?: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function Can({ role, authorId, children, fallback = null }: CanProps) {
  const { user, isAdmin, isAuthor, canModifyRecipe, isLoading } =
    usePermission();

  if (isLoading || !user) return <>{fallback}</>;
  if (role === "Admin" && !isAdmin) return <>{fallback}</>;
  if (role === "Author" && !isAuthor && !isAdmin) return <>{fallback}</>;
  if (authorId !== undefined && !canModifyRecipe(authorId)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
