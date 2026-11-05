import type { AuthResponse, AuthSessionResponse, GoogleLoginRequest, LoginRequest } from "../../types/auth";

const authPath = "/api/v1/auth";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5156";

type SessionOperation = (client: typeof import("./authApi")) => Promise<AuthSessionResponse | void>;

/**
 * The session store is mounted on every public page. Keep its refresh path on
 * the small native-fetch client; the full Axios client remains available to
 * forms and API features that actually need its interceptors. Node-based auth
 * tests still use the existing Axios adapter through the lazy fallback.
 */
async function requestSession<T>(path: string, init: RequestInit, fallback: SessionOperation): Promise<T> {
  if (typeof window === "undefined") {
    const result = await fallback(await import("./authApi"));
    return result as T;
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch (error) {
    throw error;
  }
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = Object.assign(new Error(`Authentication request failed (${response.status}).`), {
      isAxiosError: true,
      response: { status: response.status, data, headers: response.headers },
      config: { url: path },
    });
    throw error;
  }
  return (data as AuthResponse | undefined)?.data as T;
}

export function login(request: LoginRequest): Promise<AuthSessionResponse> {
  return requestSession<AuthSessionResponse>(`${authPath}/login`, {
    method: "POST", body: JSON.stringify(request),
  }, client => client.login(request));
}

export function refresh(): Promise<AuthSessionResponse> {
  return requestSession<AuthSessionResponse>(`${authPath}/refresh`, {
    method: "POST",
  }, client => client.refresh());
}

export function googleLogin(request: GoogleLoginRequest): Promise<AuthSessionResponse> {
  return requestSession<AuthSessionResponse>(`${authPath}/google`, {
    method: "POST", body: JSON.stringify(request),
  }, client => client.googleLogin(request));
}

export function logout(): Promise<void> {
  return requestSession<void>(`${authPath}/logout`, { method: "POST" }, client => client.logout());
}
