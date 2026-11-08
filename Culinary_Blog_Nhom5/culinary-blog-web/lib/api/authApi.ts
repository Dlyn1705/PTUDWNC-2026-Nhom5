import { authClient } from "./authClient";
import type { AuthResponse, AuthSessionResponse, GoogleLoginRequest, LoginRequest, RegisterRequest } from "../../types/auth";

const authPath = "/api/v1/auth";

export async function login(request: LoginRequest): Promise<AuthSessionResponse> {
  const response = await authClient.post<AuthResponse>(`${authPath}/login`, request);
  return response.data.data;
}

export async function googleLogin(request: GoogleLoginRequest): Promise<AuthSessionResponse> {
  const response = await authClient.post<AuthResponse>(`${authPath}/google`, request);
  return response.data.data;
}

export async function refresh(): Promise<AuthSessionResponse> {
  const response = await authClient.post<AuthResponse>(`${authPath}/refresh`);
  return response.data.data;
}

export async function logout(): Promise<void> {
  await authClient.post(`${authPath}/logout`);
}

export function register(request: RegisterRequest) {
  return authClient.post<AuthResponse>(`${authPath}/register`, request);
}

export async function forgotPassword(email: string): Promise<void> {
  await authClient.post(`${authPath}/forgot-password`, { email });
}

export async function resetPassword(email: string, token: string, newPassword: string): Promise<void> {
  await authClient.post(`${authPath}/reset-password`, { email, token, newPassword });
}

export async function changePassword(currentPassword: string, newPassword: string, accessToken: string): Promise<void> {
  await authClient.post(`${authPath}/change-password`, { currentPassword, newPassword }, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
