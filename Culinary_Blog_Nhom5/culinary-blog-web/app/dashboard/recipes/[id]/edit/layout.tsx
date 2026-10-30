"use client";

import { AuthGuard } from "@/components/auth/AuthGuard";

export default function EditRecipeLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard roles={["Author", "Admin"]}>{children}</AuthGuard>;
}
