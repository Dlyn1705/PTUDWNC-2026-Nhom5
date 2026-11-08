"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import type { AppRole } from "../../types/auth";
import { RouteLoading } from "@/components/common/RouteLoading";

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

  if (isInitializing) return null;
  if (!allowed) return <RouteLoading label="Đang chuyển tới trang phù hợp với quyền truy cập…" />;
  return <>{children}</>;
}
