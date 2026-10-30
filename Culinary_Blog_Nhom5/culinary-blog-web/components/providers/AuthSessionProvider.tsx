"use client";

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    void useAuthStore.getState().initialize();
    let previousUserId = useAuthStore.getState().user?.id ?? null;
    return useAuthStore.subscribe((state) => {
      const nextUserId = state.user?.id ?? null;
      if (nextUserId !== previousUserId) {
        previousUserId = nextUserId;
        queryClient.clear();
      }
    });
  }, [queryClient]);

  return <>{children}</>;
}
