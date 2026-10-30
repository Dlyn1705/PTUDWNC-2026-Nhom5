"use client";

import axios from "axios";
import { create } from "zustand";
import { login as loginApi, logout as logoutApi, refresh as refreshApi } from "../lib/api/authApi";
import type { AppRole, AuthSessionResponse, AuthUser, LoginRequest } from "../types/auth";

export type SessionUser = AuthUser & { roles: AppRole[] };

type AuthState = {
  user: SessionUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (request: LoginRequest) => Promise<void>;
  setSession: (session: AuthSessionResponse) => void;
  updateUser: (user: AuthUser) => void;
  clearSession: () => void;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
};

let sessionEpoch = 0;
let refreshFlight: Promise<string | null> | null = null;
let initializationFlight: Promise<void> | null = null;

export async function waitForRefresh(): Promise<void> {
  // The provider starts initialization in an effect. An auth action can run
  // before that effect, so start the refresh here before changing the cookie.
  if (useAuthStore.getState().isInitializing) {
    await useAuthStore.getState().initialize();
    return;
  }
  await refreshFlight?.catch(() => null);
}

const emptySession = { user: null, accessToken: null, isAuthenticated: false, isInitializing: false };

export const useAuthStore = create<AuthState>((set, get) => ({
  ...emptySession,
  isInitializing: true,
  setSession: (session) => {
    if (!session.accessToken || !session.user?.id) throw new Error("Invalid authentication response.");
    sessionEpoch++;
    const roles = session.roles.filter((role): role is AppRole => role === "Admin" || role === "Author");
    set({
      user: { ...session.user, roles },
      accessToken: session.accessToken,
      isAuthenticated: true,
      isInitializing: false,
    });
  },
  updateUser: (user) => set((state) => state.user?.id === user.id
    ? { user: { ...state.user, ...user } } : state),
  clearSession: () => {
    sessionEpoch++;
    set(emptySession);
  },
  login: async (request) => {
    await waitForRefresh();
    get().setSession(await loginApi(request));
  },
  logout: async () => {
    // Wait for cookie rotation before asking the backend to revoke that cookie.
    await waitForRefresh();
    try {
      await logoutApi();
    } catch (error) {
      if (!axios.isAxiosError(error) || ![401, 403].includes(error.response?.status ?? 0)) throw error;
    }
    get().clearSession();
  },
  initialize: async () => {
    if (!get().isInitializing) return;
    if (!initializationFlight) {
      initializationFlight = refreshSession().then(() => undefined, () => undefined).finally(() => {
        set({ isInitializing: false });
        initializationFlight = null;
      });
    }
    return initializationFlight;
  },
}));

// One flight prevents refresh-cookie rotation reuse.
export function refreshSession(): Promise<string | null> {
  if (!refreshFlight) {
    const startedAt = sessionEpoch;
    const flight = refreshApi().then((session) => {
      if (startedAt !== sessionEpoch) return null;
      useAuthStore.getState().setSession(session);
      return session.accessToken;
    }, (error) => {
      if (startedAt === sessionEpoch) useAuthStore.getState().clearSession();
      throw error;
    });
    refreshFlight = flight;
    void flight.finally(() => {
      if (refreshFlight === flight) refreshFlight = null;
    }).catch(() => undefined);
  }
  return refreshFlight;
}

export const selectIsAdmin = (state: AuthState) => state.user?.roles.includes("Admin") ?? false;
export const selectIsAuthor = (state: AuthState) =>
  state.user?.roles.some((role) => role === "Author" || role === "Admin") ?? false;
