import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";

type AuthConfig = InternalAxiosRequestConfig & { authRetried?: boolean; authAccessToken?: string };

export function installSessionAuth(client: AxiosInstance, session: {
  getToken: () => string | null;
  initialize: () => Promise<void>;
  refresh: () => Promise<string | null>;
}) {
  let refreshFlight: Promise<string | null> | null = null;
  const refreshOnce = () => {
    if (!refreshFlight) {
      const flight = session.refresh();
      refreshFlight = flight;
      void flight.finally(() => {
        if (refreshFlight === flight) refreshFlight = null;
      }).catch(() => undefined);
    }
    return refreshFlight;
  };

  client.interceptors.request.use(async (config: AuthConfig) => {
    await session.initialize();
    if (refreshFlight) await refreshFlight;
    // A retry already carries the token obtained for this rejected request.
    const token = config.authRetried ? config.authAccessToken : session.getToken();
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
      config.authAccessToken = token;
    } else {
      config.headers.delete("Authorization");
      delete config.authAccessToken;
    }
    return config;
  });

  client.interceptors.response.use((response) => response, async (error) => {
    const config = error.config as AuthConfig | undefined;
    if (error.response?.status !== 401 || !config?.authAccessToken || config.authRetried) throw error;
    config.authRetried = true;
    const rejectedToken = config.authAccessToken;
    // Another request may have refreshed the token while this 401 was in flight.
    const currentToken = session.getToken();
    const nextToken = currentToken && currentToken !== rejectedToken
      ? currentToken : await refreshOnce();
    if (!nextToken || nextToken === rejectedToken) throw error;
    config.authAccessToken = nextToken;
    return client.request(config);
  });
}
