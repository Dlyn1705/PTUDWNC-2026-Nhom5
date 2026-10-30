"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import type { AppRole } from "../../types/auth";

export function AuthGuard({ children, roles }: { children: ReactNode; roles?: AppRole[] }) {
  const { user, isAuthenticated, isInitializing } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = isAuthenticated && (!roles || roles.some((role) => user?.roles.includes(role)));

  useEffect(() => {
    if (isInitializing || allowed) return;
    if (!isAuthenticated) {
      const callbackUrl = `${window.location.pathname}${window.location.search}`;
      router.replace(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    } else {
      router.replace("/forbidden");
    }
  }, [allowed, isAuthenticated, isInitializing, pathname, router]);

  if (isInitializing) return <p role="status" className="p-8">Đang khôi phục phiên đăng nhập…</p>;
  return allowed ? <>{children}</> : null;
}
