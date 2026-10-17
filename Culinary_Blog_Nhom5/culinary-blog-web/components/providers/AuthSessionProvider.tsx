"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { SessionStateSynchronizer } from "./SessionStateSynchronizer";
import { UIStoreHydrator } from "./UIStoreHydrator";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionStateSynchronizer />
      <UIStoreHydrator />
      {children}
    </SessionProvider>
  );
}
