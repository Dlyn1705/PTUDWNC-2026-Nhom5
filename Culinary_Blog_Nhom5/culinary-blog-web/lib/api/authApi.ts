import { signIn, signOut } from "next-auth/react";
import axiosClient from "./axiosClient";
import type { ApiResponse } from "@/types/api.types";
import type { RegisterRequest } from "@/types/auth";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface GoogleLoginRequest {
  idToken: string;
}

export interface CurrentUserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

function unwrapProfile(response: ApiResponse<CurrentUserProfile>) {
  if (!response.success || !response.data) {
    throw new Error(response.message || "Không thể tải hồ sơ.");
  }
  return response.data;
}

export function login(request: LoginRequest) {
  return signIn("credentials", {
    ...request,
    redirect: false,
  });
}

/**
 * Registration returns the created profile only. The API closes the
 * provisional refresh token and the user then enters the normal Auth.js login
 * flow.
 */
export async function register(request: RegisterRequest) {
  const response = await axiosClient.post<ApiResponse<CurrentUserProfile>>(
    "/api/v1/auth/register",
    request,
  );
  return unwrapProfile(response.data);
}

export function googleLogin(request: GoogleLoginRequest) {
  return signIn("google-id-token", {
    idToken: request.idToken,
    redirect: false,
  });
}

export async function refreshToken(rejectedAccessToken: string) {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Requested-With": "culinary-web" },
    body: JSON.stringify({ rejectedAccessToken }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Phiên đăng nhập đã hết hạn.");
  return response.json() as Promise<{ user: { accessToken: string; accessTokenExpiry: string } }>;
}

export function logout() {
  return signOut({ redirect: false });
}

export async function getCurrentUserProfile(signal?: AbortSignal) {
  const response = await axiosClient.get<ApiResponse<CurrentUserProfile>>(
    "/api/v1/auth/me", { signal },
  );
  return unwrapProfile(response.data);
}

export const getMe = getCurrentUserProfile;

export async function updateCurrentUserProfile(
  profile: Pick<CurrentUserProfile, "displayName" | "bio">,
) {
  const response = await axiosClient.patch<ApiResponse<CurrentUserProfile>>(
    "/api/v1/auth/me", profile,
  );
  return unwrapProfile(response.data);
}

export const updateMe = updateCurrentUserProfile;

export async function uploadCurrentUserAvatar(file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await axiosClient.post<ApiResponse<CurrentUserProfile>>(
    "/api/v1/auth/me/avatar", form, {
      timeout: 120_000,
      headers: { "Content-Type": undefined },
    },
  );
  return unwrapProfile(response.data);
}

export async function changeCurrentUserPassword(request: ChangePasswordRequest) {
  await axiosClient.patch("/api/v1/auth/me/password", request);
}
