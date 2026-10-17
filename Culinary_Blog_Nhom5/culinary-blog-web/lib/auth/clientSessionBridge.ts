export interface ClientSessionBridge {
  getAccessToken(): string | undefined;
  refreshAccessToken(): Promise<string | undefined>;
  invalidateSession(callbackUrl?: string): Promise<void>;
}

let activeBridge: ClientSessionBridge | undefined;

export function registerClientSessionBridge(bridge: ClientSessionBridge): () => void {
  activeBridge = bridge;
  return () => {
    if (activeBridge === bridge) activeBridge = undefined;
  };
}

export function getClientAccessToken(): string | undefined {
  return activeBridge?.getAccessToken();
}

export function forceClientSessionRefresh(): Promise<string | undefined> {
  return activeBridge?.refreshAccessToken() ?? Promise.resolve(undefined);
}

export function getCurrentCallbackUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const callbackUrl = `${window.location.pathname}${window.location.search}`;
  return callbackUrl === "/auth/login" || callbackUrl === "/login" ? undefined : callbackUrl;
}

export async function invalidateClientSession(callbackUrl?: string): Promise<void> {
  if (activeBridge) {
    await activeBridge.invalidateSession(callbackUrl);
    return;
  }

  if (typeof window === "undefined") return;
  const loginUrl = new URL("/auth/login", window.location.origin);
  const safeCallback = callbackUrl ?? getCurrentCallbackUrl();
  if (safeCallback) loginUrl.searchParams.set("callbackUrl", safeCallback);
  window.location.assign(loginUrl.toString());
}
