import type { DefaultSession } from "next-auth";

type AppRole = "Admin" | "Author";

declare module "next-auth" {
  interface User {
    id: string;
    role: AppRole;
    accessToken: string;
  }

  interface Session {
    user: {
      id: string;
      role: AppRole;
      accessToken: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: AppRole;
    accessToken: string;
  }
}
