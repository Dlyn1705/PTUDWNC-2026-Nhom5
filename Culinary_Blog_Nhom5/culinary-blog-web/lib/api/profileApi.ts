import { axiosClient } from "./axiosClient";
import type { CurrentUser } from "../../types/auth";

export type UpdateProfile = { displayName: string; bio: string; avatarUrl: string };

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await axiosClient.get<{ data: CurrentUser }>("/api/v1/auth/me");
  return response.data.data;
}

export async function updateProfile(request: UpdateProfile): Promise<CurrentUser> {
  const response = await axiosClient.patch<{ data: CurrentUser }>("/api/v1/auth/me", request);
  return response.data.data;
}
