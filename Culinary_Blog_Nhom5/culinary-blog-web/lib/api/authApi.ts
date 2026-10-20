import { signIn, signOut } from "next-auth/react";
import axiosClient from "./axiosClient";
import type { ApiResponse } from "@/types/api.types";
import type { RegisterRequest } from "@/types/auth";

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

export function register(request: RegisterRequest) {
  return axiosClient.post<ApiResponse<unknown>>("/api/v1/auth/register", request);
}
