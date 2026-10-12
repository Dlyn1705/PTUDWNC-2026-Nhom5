import "server-only";
import NextAuth, { type User } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import {
  backendUrl, readBackendTokens, refreshBackendTokens, revokeBackendTokens, RefreshRejected,
} from "./auth/backendTokens";
import { SessionCoordinator } from "./auth/sessionCoordinator";
import { redisSessionStore } from "./auth/redisSessionStore";

const backendSessions = new SessionCoordinator(redisSessionStore, refreshBackendTokens, revokeBackendTokens);

async function readBackendUser(response: Response): Promise<User | null> {
  if (!response.ok) return null;
  const backendTokens = await readBackendTokens(response);
  if (!backendTokens.session.roles.some((role) => role === "Admin" || role === "Author")) {
    await revokeBackendTokens(backendTokens.refreshToken).catch(() => {});
    return null;
  }
  return {
    id: backendTokens.session.user.id,
    name: backendTokens.session.user.displayName,
    email: backendTokens.session.user.email,
    backendTokens,
  };
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
        if (typeof credentials.email !== "string" || typeof credentials.password !== "string") return null;
        const response = await fetch(backendUrl("/api/v1/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        return readBackendUser(response);
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
        const response = await fetch(backendUrl("/api/v1/auth/google"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: credentials.idToken }),
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        return readBackendUser(response);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const issuedTokens = user?.backendTokens;

      if (issuedTokens) {
        try {
          token.backendSessionId = await backendSessions.create(issuedTokens);
        } catch {
          await revokeBackendTokens(issuedTokens.refreshToken).catch(() => {});
          throw new Error("Authentication session storage is unavailable.");
        }
      }

      // Never reuse token/role values from an old cookie if shared state cannot be read.
      delete token.backendRefreshToken;
      delete token.accessToken;
      delete token.accessTokenExpiry;
      delete token.role;
      delete token.roles;
      delete token.googleAccessToken;
      if (!token.backendSessionId) {
        token.error = "RefreshTokenError";
        return token;
      }
      try {
        const { session: current } = await backendSessions.resolve(token.backendSessionId);
        token.id = current.user.id;
        token.sub = current.user.id;
        token.name = current.user.displayName;
        token.email = current.user.email;
        token.accessToken = current.accessToken;
        token.accessTokenExpiry = current.accessTokenExpiry;
        token.roles = current.roles.filter((role): role is "Admin" | "Author" => role === "Admin" || role === "Author");
        token.role = token.roles.includes("Admin") ? "Admin" : token.roles.includes("Author") ? "Author" : undefined;
        token.error = undefined;
      } catch (error) {
        token.error = error instanceof RefreshRejected ? "RefreshTokenError" : "SessionUnavailableError";
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = typeof token.id === "string" ? token.id : "";
      session.user.role = token.role;
      session.user.roles = token.roles ?? [];
      session.user.accessToken = token.accessToken;
      session.user.accessTokenExpiry = token.accessTokenExpiry;
      session.error = token.error;
      // The browser receives neither the Redis session ID nor a refresh token.
      return session;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && typeof message.token?.backendSessionId === "string") {
        try {
          await backendSessions.logout(message.token.backendSessionId);
        } catch {
          console.warn("Backend logout is temporarily unavailable.");
        }
      }
    },
  },
});
