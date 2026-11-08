"use client";

import { AuthGuard } from "@/components/auth/AuthGuard";

export default function CreateRecipeLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard roles={["Author", "Admin"]}>{children}</AuthGuard>;
}
