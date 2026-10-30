"use client";

import { AuthGuard } from "@/components/auth/AuthGuard";

export default function AdminCategoriesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AuthGuard roles={["Admin"]}>{children}</AuthGuard>;
}
