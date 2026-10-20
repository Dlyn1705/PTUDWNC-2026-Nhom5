"use client";

import { SessionProvider, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, type ReactNode } from "react";
import { useAuthStore } from "@/store/useAuthStore";

function SessionStatus() {
  const { data: session, status } = useSession();
  const syncFromSession = useAuthStore((state) => state.syncFromSession);
  const clear = useAuthStore((state) => state.clear);
  const signingOut = useRef(false);
  useEffect(() => {
    if (status === "unauthenticated" || session?.error === "RefreshTokenError") clear();
    else syncFromSession(session, status);
  }, [clear, session, status, syncFromSession]);
  useEffect(() => {
    if (session?.error !== "RefreshTokenError" || signingOut.current) return;
    signingOut.current = true;
    const callbackUrl = `${window.location.pathname}${window.location.search}`;
    void signOut({ redirectTo: `/auth/login?reason=session-expired&callbackUrl=${encodeURIComponent(callbackUrl)}` });
  }, [session?.error]);
  if (session?.error === "SessionUnavailableError") {
    return <p role="status" className="bg-amber-50 p-3 text-center text-sm text-amber-900">Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại sau.</p>;
  }
  return null;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return <SessionProvider refetchInterval={60} refetchOnWindowFocus refetchWhenOffline={false}>
    <SessionStatus />{children}
  </SessionProvider>;
}
