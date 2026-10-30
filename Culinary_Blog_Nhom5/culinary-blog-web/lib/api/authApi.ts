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
