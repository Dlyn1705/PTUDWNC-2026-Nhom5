import { signIn, signOut } from "next-auth/react";

export interface LoginRequest {
  email: string;
  password: string;
}

export function login(request: LoginRequest) {
  return signIn("credentials", {
    ...request,
    redirect: false,
  });
}

export function logout() {
  return signOut({ redirect: false });
}
