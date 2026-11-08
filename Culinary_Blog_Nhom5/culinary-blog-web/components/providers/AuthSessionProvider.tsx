"use client";

import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "../../store/authStore";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => { void useAuthStore.getState().initialize(); }, []);
  return <>{children}</>;
}
