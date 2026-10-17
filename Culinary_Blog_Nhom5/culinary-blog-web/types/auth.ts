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

export type AuthSessionResponse = AuthResponse;
