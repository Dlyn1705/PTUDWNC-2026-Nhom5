import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { AuthResponse, AuthSessionResponse } from "@/types/auth";

const backendBaseUrl =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:5156";

const refreshCookieName = "culinary_refresh_token=";

function getBackendRefreshToken(response: Response): string | undefined {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(refreshCookieName));
  const value = cookie?.slice(refreshCookieName.length).split(";", 1)[0];
  return value ? decodeURIComponent(value) : undefined;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
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

        if (!response.ok) return null;

        const authResponse = (await response.json()) as AuthResponse;
        const roles = authResponse.roles.filter(
          (candidate): candidate is "Admin" | "Author" =>
            candidate === "Admin" || candidate === "Author",
        );
        const role = roles.includes("Admin")
          ? "Admin"
          : roles.includes("Author")
            ? "Author"
            : null;

        if (!role || !authResponse.user.id || !authResponse.accessToken) {
          return null;
        }

        return {
          id: authResponse.user.id,
          name: authResponse.user.displayName,
          email: authResponse.user.email,
          role,
          accessToken: authResponse.accessToken,
          backendRefreshToken: authResponse.refreshToken,
          accessTokenExpiry: authResponse.accessTokenExpiry,
          roles,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      checks: ["pkce", "state"],
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      return account?.provider !== "google" || profile?.email_verified === true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.accessToken = user.accessToken;
        token.backendRefreshToken = user.backendRefreshToken;
        token.accessTokenExpiry = user.accessTokenExpiry;
        token.roles = user.roles;
      }

      if (account?.provider === "google") {
        if (!account.id_token) {
          throw new Error("Google did not return an ID token.");
        }

        const response = await fetch(
          new URL("/api/v1/auth/google", backendBaseUrl),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: account.id_token }),
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            `Google sign-in failed at the backend (${response.status}).`,
          );
        }

        const backendSession = (await response.json()) as AuthSessionResponse;
        const backendRefreshToken = getBackendRefreshToken(response);
        if (!backendRefreshToken) {
          throw new Error("The backend did not issue a refresh cookie.");
        }

        token.id = backendSession.user.id;
        token.sub = backendSession.user.id;
        token.accessToken = backendSession.accessToken;
        token.backendRefreshToken = backendRefreshToken;
        token.accessTokenExpiry = backendSession.accessTokenExpiry;
        token.googleAccessToken = account.access_token;
        token.roles = backendSession.roles;
        token.role = backendSession.roles.includes("Admin")
          ? "Admin"
          : backendSession.roles.includes("Author")
            ? "Author"
            : undefined;
        token.name = backendSession.user.displayName;
        token.email = backendSession.user.email;
        token.error = undefined;
      }

      const expiresAt = Date.parse(String(token.accessTokenExpiry ?? ""));
      if (
        token.accessToken &&
        token.backendRefreshToken &&
        Number.isFinite(expiresAt) &&
        expiresAt <= Date.now() + 60_000
      ) {
        try {
          const response = await fetch(
            new URL("/api/v1/auth/refresh", backendBaseUrl),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ refreshToken: token.backendRefreshToken }),
              cache: "no-store",
            },
          );

          if (!response.ok) {
            throw new Error(`Backend token refresh failed (${response.status}).`);
          }

          const refreshedSession = (await response.json()) as AuthSessionResponse;
          const rotatedRefreshToken = getBackendRefreshToken(response);
          if (!rotatedRefreshToken) {
            throw new Error("The backend did not rotate the refresh cookie.");
          }

          token.accessToken = refreshedSession.accessToken;
          token.backendRefreshToken = rotatedRefreshToken;
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
        session.user.googleAccessToken =
          typeof token.googleAccessToken === "string"
            ? token.googleAccessToken
            : undefined;
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
});
