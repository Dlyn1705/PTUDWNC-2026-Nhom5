import { axiosClient } from "./axiosClient";
import type { CurrentUser } from "../../types/auth";
import { validateImageFile } from "./imageErrors";

export type UpdateProfile = { displayName: string; bio: string; avatarUrl: string };
export type ProfileRecipeStats = { created: number; published: number };

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await axiosClient.get<{ data: CurrentUser }>("/api/v1/auth/me");
  return response.data.data;
}

export async function updateProfile(request: UpdateProfile): Promise<CurrentUser> {
  const response = await axiosClient.patch<{ data: CurrentUser }>("/api/v1/auth/me", request);
  return response.data.data;
}

export async function getProfileRecipeStats(): Promise<ProfileRecipeStats> {
  const response = await axiosClient.get<{ data: ProfileRecipeStats }>("/api/v1/auth/me/recipe-stats");
  return response.data.data;
}

export async function uploadProfileAvatar(file: File): Promise<CurrentUser> {
  validateImageFile(file);
  const form = new FormData();
  form.append("file", file);
  const response = await axiosClient.post<{ data: CurrentUser }>("/api/v1/auth/me/avatar", form, {
    timeout: 120_000, headers: { "Content-Type": undefined },
  });
  return response.data.data;
}
