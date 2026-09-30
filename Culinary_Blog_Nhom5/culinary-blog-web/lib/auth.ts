import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { AuthResponse } from "@/types/auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://localhost:7001";

export const { handlers, auth, signIn, signOut } = NextAuth({
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

        const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
          cache: "no-store",
        });

        if (!response.ok) return null;

        const data = (await response.json()) as AuthResponse;
        const role = data.roles.includes("Admin")
          ? "Admin"
          : data.roles.includes("Author")
            ? "Author"
            : null;

        if (!role || !data.user.id || !data.accessToken) return null;

        return {
          id: data.user.id,
          name: data.user.displayName,
          email: data.user.email,
          role,
          accessToken: data.accessToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (token.role === "Admin" || token.role === "Author") {
        session.user.role = token.role;
      }
      if (typeof token.accessToken === "string") {
        session.user.accessToken = token.accessToken;
      }
      return session;
    },
  },
});
