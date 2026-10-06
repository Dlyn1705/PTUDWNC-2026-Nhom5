import type { DefaultSession } from "next-auth";

type AppRole = "Admin" | "Author";

declare module "next-auth" {
  interface User {
    id: string;
    role?: AppRole;
    accessToken?: string;
    backendRefreshToken?: string;
    accessTokenExpiry?: string;
    googleAccessToken?: string;
    error?: string;
    roles?: AppRole[];
  }

  interface Session {
    user: {
      id: string;
      role?: AppRole;
      accessToken?: string;
      googleAccessToken?: string;
      accessTokenExpiry?: string;
      roles: AppRole[];
    } & DefaultSession["user"];
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: AppRole;
    accessToken?: string;
    backendRefreshToken?: string;
    accessTokenExpiry?: string;
    googleAccessToken?: string;
    error?: string;
    roles?: AppRole[];
  }
}
