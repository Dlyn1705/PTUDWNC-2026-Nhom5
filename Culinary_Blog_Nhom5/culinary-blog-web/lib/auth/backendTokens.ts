import type { AuthSessionResponse } from "../../types/auth";

export type BackendTokens = {
  session: AuthSessionResponse;
  refreshToken: string;
  refreshTokenExpiry: number;
};

// Only call on the server. Set-Cookie from a server fetch is never forwarded to browser JavaScript.
export async function readBackendTokens(response: Response): Promise<BackendTokens> {
  const cookie = response.headers.getSetCookie()
    .find((value) => value.startsWith("culinary_refresh_token="));
  const cookieParts = cookie?.split(";").map((part) => part.trim());
  const refreshToken = cookieParts?.[0].slice("culinary_refresh_token=".length);
  const expires = cookieParts?.find((part) => part.toLowerCase().startsWith("expires="))?.slice(8);
  const refreshTokenExpiry = Date.parse(expires ?? "");
  const session = await response.json() as AuthSessionResponse;
  const accessExpiry = Date.parse(session.accessTokenExpiry ?? "");
  if (!response.ok || !refreshToken || !Number.isFinite(refreshTokenExpiry)
    || refreshTokenExpiry <= Date.now() || !session.accessToken || !Number.isFinite(accessExpiry)
    || accessExpiry <= Date.now() || !session.user?.id || !Array.isArray(session.roles)) {
    throw new Error("Invalid backend authentication response.");
  }
  return { session, refreshToken: decodeURIComponent(refreshToken), refreshTokenExpiry };
}

export class RefreshRejected extends Error {}
export class RefreshUnavailable extends Error {
  constructor(public readonly retryAfterMs = 60_000) {
    super("Token service is temporarily unavailable.");
  }
}

export function backendUrl(path: string): URL {
  return new URL(path, process.env.API_INTERNAL_URL
    ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5156");
}

export async function refreshBackendTokens(refreshToken: string): Promise<BackendTokens> {
  const response = await fetch(backendUrl("/api/v1/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 401 || response.status === 423) throw new RefreshRejected();
  // A rejected rate-limited request has not consumed the token and can safely be retried later.
  if (response.status === 429) {
    const seconds = Number(response.headers.get("retry-after"));
    throw new RefreshUnavailable(seconds > 0 ? Math.min(seconds * 1_000, 300_000) : 60_000);
  }
  if (!response.ok) throw new Error("Backend refresh outcome is uncertain.");
  return readBackendTokens(response);
}

export async function revokeBackendTokens(refreshToken: string): Promise<void> {
  const response = await fetch(backendUrl("/api/v1/auth/logout"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Backend logout is temporarily unavailable.");
}
