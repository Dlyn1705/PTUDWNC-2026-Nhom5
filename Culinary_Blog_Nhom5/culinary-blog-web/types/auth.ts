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
  bio?: string | null;
  role?: AppRole;
  roles?: AppRole[];
}

export interface AuthSessionResponse {
  accessToken: string;
  accessTokenExpiry: string;
  user: AuthUser;
  roles: string[];
}

// Success responses follow the API contract's { data: ... } wrapper. Refresh
// tokens are delivered only through the HttpOnly cookie and are absent here.
export interface AuthResponse {
  data: AuthSessionResponse;
  success?: boolean;
  message?: string | null;
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
