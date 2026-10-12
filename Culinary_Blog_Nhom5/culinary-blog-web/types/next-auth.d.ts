import type { DefaultSession } from "next-auth";
import type {} from "@auth/core/jwt";
import type { BackendTokens } from "../lib/auth/backendTokens";

type AppRole = "Admin" | "Author";

declare module "next-auth" {
  interface User {
    id: string;
    role?: AppRole;
    accessToken?: string;
    backendRefreshToken?: string;
    backendTokens?: BackendTokens;
    accessTokenExpiry?: string;
    error?: string;
    roles?: AppRole[];
  }

  interface Session {
    user: {
      id: string;
      role?: AppRole;
      accessToken?: string;
      accessTokenExpiry?: string;
      roles: AppRole[];
    } & DefaultSession["user"];
    error?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: AppRole;
    accessToken?: string;
    backendRefreshToken?: string;
    backendSessionId?: string;
    accessTokenExpiry?: string;
    error?: string;
    roles?: AppRole[];
  }
}
