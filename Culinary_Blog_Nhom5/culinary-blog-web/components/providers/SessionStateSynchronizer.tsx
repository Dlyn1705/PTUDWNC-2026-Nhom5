"use client";

import { useCallback, useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  getCurrentCallbackUrl,
  registerClientSessionBridge,
} from "@/lib/auth/clientSessionBridge";
import { useAuthStore } from "@/store/useAuthStore";

function safeCallbackUrl(value?: string): string | undefined {
  return value?.startsWith("/") && !value.startsWith("//") ? value : getCurrentCallbackUrl();
}

function loginDestination(callbackUrl?: string): string {
  const target = new URL("/auth/login", window.location.origin);
  const callback = safeCallbackUrl(callbackUrl);
  if (callback) target.searchParams.set("callbackUrl", callback);
  return target.toString();
}

/** Bridges the client Auth.js session to minimal UI state and Axios. */
export function SessionStateSynchronizer() {
  const { data: session, status, update } = useSession();
  const invalidation = useRef<Promise<void> | null>(null);

  const invalidateSession = useCallback((callbackUrl?: string): Promise<void> => {
    if (invalidation.current) return invalidation.current;

    const pending = (async () => {
      useAuthStore.getState().clear();
      try {
        await signOut({ redirect: false });
      } catch {
        // The local Auth.js cookie is best-effort here; redirecting still ends
        // this client session when a refresh token is no longer usable.
      }
      window.location.assign(loginDestination(callbackUrl));
    })();
    invalidation.current = pending;
    return pending;
  }, []);

  useEffect(() => {
    useAuthStore.getState().syncFromSession(session, status);
    if (session?.error === "RefreshTokenError") {
      void invalidateSession();
    }
  }, [invalidateSession, session, status]);

  useEffect(() => {
    return registerClientSessionBridge({
      getAccessToken: () => (
        status === "authenticated" && !session?.error
          ? session.user.accessToken
          : undefined
      ),
      refreshAccessToken: async () => {
        const refreshed = await update({ forceRefresh: true });
        if (!refreshed?.user.accessToken || refreshed.error) {
          await invalidateSession();
          return undefined;
        }
        return refreshed.user.accessToken;
      },
      invalidateSession,
    });
  }, [invalidateSession, session, status, update]);

  return null;
}
