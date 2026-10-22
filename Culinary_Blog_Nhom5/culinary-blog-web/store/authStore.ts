"use client";

import { create } from "zustand";
import { getSession, signIn, signOut } from "next-auth/react";
import type { Session } from "next-auth";
import type { AppRole, LoginRequest } from "@/types/auth";

export type AuthStoreUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: AppRole;
  roles: AppRole[];
  accessToken?: string;
  accessTokenExpiry?: string;
};

type AuthStore = {
  user: AuthStoreUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  syncSession: (session: Session | null | undefined) => void;
  login: (request: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
};

function mapSession(session: Session | null | undefined): AuthStoreUser | null {
  if (!session?.user || session.error) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    role: session.user.role,
    roles: session.user.roles ?? [],
    accessToken: session.user.accessToken,
    accessTokenExpiry: session.user.accessTokenExpiry,
  };
}

const emptyState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
} as const;

export const useAuthStore = create<AuthStore>((set) => ({
  ...emptyState,

  syncSession: (session) => {
    const user = mapSession(session);
    set({
      user,
      accessToken: user?.accessToken ?? null,
      isAuthenticated: user !== null,
      error: session?.error ?? null,
    });
  },

  login: async (request) => {
    set({ isLoading: true, error: null });
    try {
      const result = await signIn("credentials", {
        ...request,
        redirect: false,
      });
      if (!result || result.error) {
        throw new Error("Email hoặc mật khẩu không chính xác.");
      }

      const session = await getSession({ broadcast: false });
      const user = mapSession(session);
      if (!user) throw new Error("Không thể khởi tạo phiên đăng nhập.");
      set({
        user,
        accessToken: user.accessToken ?? null,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Không thể đăng nhập.";
      set({ ...emptyState, error: message, isLoading: false });
      throw new Error(message);
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await signOut({ redirect: false });
    } finally {
      set({ ...emptyState });
    }
  },
}));
