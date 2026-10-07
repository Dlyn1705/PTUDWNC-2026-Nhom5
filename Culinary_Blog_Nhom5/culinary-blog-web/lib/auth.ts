import "server-only";
import NextAuth, { type User } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { AuthResponse, AuthSessionResponse } from "@/types/auth";

const backendBaseUrl =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:5156";

const refreshCookieName = "culinary_refresh_token=";
type RefreshedSession = {
  session: AuthSessionResponse;
  refreshToken: string;
};
const refreshRequests = new Map<string, Promise<RefreshedSession>>();

function getBackendRefreshToken(response: Response): string | undefined {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(refreshCookieName));
  const value = cookie?.slice(refreshCookieName.length).split(";", 1)[0];
  return value ? decodeURIComponent(value) : undefined;
}

async function readBackendAuthResponse(response: Response): Promise<User | null> {
  if (!response.ok) return null;

  const authResponse = (await response.json()) as AuthResponse;
  const backendRefreshToken = getBackendRefreshToken(response);
  const roles = authResponse.roles.filter(
    (candidate): candidate is "Admin" | "Author" =>
      candidate === "Admin" || candidate === "Author",
  );
  const role = roles.includes("Admin")
    ? "Admin"
    : roles.includes("Author")
      ? "Author"
      : null;

  if (
    !role ||
    !authResponse.user.id ||
    !authResponse.accessToken ||
    !backendRefreshToken
  ) {
    return null;
  }

  return {
    id: authResponse.user.id,
    name: authResponse.user.displayName,
    email: authResponse.user.email,
    role,
    accessToken: authResponse.accessToken,
    backendRefreshToken,
    accessTokenExpiry: authResponse.accessTokenExpiry,
    roles,
  };
}

async function refreshBackendSession(
  refreshToken: string,
): Promise<RefreshedSession> {
  const inFlight = refreshRequests.get(refreshToken);
  if (inFlight) return inFlight;

  const request = (async () => {
    const response = await fetch(
      new URL("/api/v1/auth/refresh", backendBaseUrl),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Backend token refresh failed (${response.status}).`);
    }

    const session = (await response.json()) as AuthSessionResponse;
    const rotatedRefreshToken = getBackendRefreshToken(response);
    if (!rotatedRefreshToken) {
      throw new Error("The backend did not rotate the refresh cookie.");
    }

    return { session, refreshToken: rotatedRefreshToken };
  })();

  refreshRequests.set(refreshToken, request);
  try {
    return await request;
  } finally {
    if (refreshRequests.get(refreshToken) === request) {
      refreshRequests.delete(refreshToken);
    }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (
          typeof credentials.email !== "string" ||
          typeof credentials.password !== "string"
        ) {
          return null;
        }

        const response = await fetch(
          new URL("/api/v1/auth/login", backendBaseUrl),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
            cache: "no-store",
          },
        );

        return readBackendAuthResponse(response);
      },
    }),
    Credentials({
      id: "google-id-token",
      name: "Google",
      credentials: {
        idToken: { label: "Google ID token", type: "text" },
      },
      async authorize(credentials) {
        if (typeof credentials.idToken !== "string") return null;

        const response = await fetch(
          new URL("/api/v1/auth/google", backendBaseUrl),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: credentials.idToken }),
            cache: "no-store",
          },
        );

        return readBackendAuthResponse(response);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.accessToken = user.accessToken;
        token.backendRefreshToken = user.backendRefreshToken;
        token.accessTokenExpiry = user.accessTokenExpiry;
        token.roles = user.roles;
      }

      const expiresAt = Date.parse(String(token.accessTokenExpiry ?? ""));
      if (
        typeof token.accessToken === "string" &&
        typeof token.backendRefreshToken === "string" &&
        Number.isFinite(expiresAt) &&
        expiresAt <= Date.now() + 60_000
      ) {
        try {
          const refreshed = await refreshBackendSession(token.backendRefreshToken);
          const refreshedSession = refreshed.session;

          token.accessToken = refreshedSession.accessToken;
          token.backendRefreshToken = refreshed.refreshToken;
          token.accessTokenExpiry = refreshedSession.accessTokenExpiry;
          token.roles = refreshedSession.roles;
          token.role = refreshedSession.roles.includes("Admin")
            ? "Admin"
            : refreshedSession.roles.includes("Author")
              ? "Author"
              : undefined;
          token.error = undefined;
        } catch (error) {
          console.error("Backend access token refresh failed", error);
          token.error = "RefreshTokenError";
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id =
          typeof token.id === "string"
            ? token.id
            : typeof token.sub === "string"
              ? token.sub
              : "";
        if (token.role === "Admin" || token.role === "Author") {
          session.user.role = token.role;
        }
        session.user.accessToken =
          typeof token.accessToken === "string" ? token.accessToken : undefined;
        session.user.roles = Array.isArray(token.roles)
          ? token.roles.filter(
              (role): role is "Admin" | "Author" =>
                role === "Admin" || role === "Author",
            )
          : token.role === "Admin" || token.role === "Author"
            ? [token.role]
            : [];
        session.user.accessTokenExpiry =
          typeof token.accessTokenExpiry === "string"
            ? token.accessTokenExpiry
            : undefined;
      }
      session.error = typeof token.error === "string" ? token.error : undefined;
      return session;
    },
  },
  events: {
    async signOut(message) {
      if (!("token" in message) || !message.token) return;

      const refreshToken = message.token.backendRefreshToken;
      const accessToken = message.token.accessToken;
      if (typeof refreshToken !== "string" || typeof accessToken !== "string") {
        return;
      }

      try {
        const response = await fetch(
          new URL("/api/v1/auth/logout", backendBaseUrl),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ refreshToken }),
            cache: "no-store",
          },
        );
        if (!response.ok) {
          console.error(`Backend logout failed (${response.status}).`);
        }
      } catch {
        console.error("Backend logout request failed.");
      }
    },
  },
});
