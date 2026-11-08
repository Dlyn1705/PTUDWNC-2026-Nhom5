import { AuthGuard } from "@/components/auth/AuthGuard";
import type { ReactNode } from "react";

export default function UsersLayout({ children }: { children: ReactNode }) {
  return <AuthGuard roles={["Admin"]}>{children}</AuthGuard>;
}
