"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { useAuthStore } from "@/store/authStore";
import { watchQuerySession } from "@/lib/query-session";

function SessionQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => watchQuerySession(queryClient, useAuthStore), [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const sessionId = useAuthStore(state => state.user?.id ?? "anonymous");
  // Recreate before rendering children, including layouts restored from the router cache.
  return <SessionQueryProvider key={sessionId}>{children}</SessionQueryProvider>;
}
