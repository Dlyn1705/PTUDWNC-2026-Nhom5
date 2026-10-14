export type AppRole = "Admin" | "Author";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface GoogleLoginRequest {
  idToken: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RegisterRequest {
  email: string;
  displayName: string;
  password: string;
  confirmPassword: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  accessTokenExpiry: string;
  user: AuthUser;
  roles: string[];
}

export interface ProblemDetails {
  type?: string;
  instance?: string;
  status?: number;
  title?: string;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export type AuthSessionResponse = AuthResponse;
