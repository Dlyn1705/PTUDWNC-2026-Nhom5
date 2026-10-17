import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { ApiProblemError, toApiProblemError } from "./problemDetails";

type AuthAwareConfig = InternalAxiosRequestConfig & {
  __authRetried?: boolean;
  __accessTokenOverride?: string;
  skipAuthRefresh?: boolean;
};

export interface ApiAuthBridge {
  getAccessToken(): string | undefined | Promise<string | undefined>;
  refreshAccessToken(): Promise<string | undefined>;
  invalidateSession(callbackUrl?: string): void | Promise<void>;
  getCallbackUrl?(): string | undefined;
  isBrowser?(): boolean;
}

function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  try {
    return new URL(url, "http://local.invalid").pathname.startsWith("/api/v1/auth/");
  } catch {
    return false;
  }
}

function setAuthorization(config: AuthAwareConfig, token?: string): void {
  if (!config.headers) return;

  if (typeof config.headers.set === "function") {
    if (token) config.headers.set("Authorization", `Bearer ${token}`);
    else config.headers.delete?.("Authorization");
    return;
  }

  if (token) config.headers.Authorization = `Bearer ${token}`;
  else delete config.headers.Authorization;
}

function sessionExpiredError(correlationId?: string): ApiProblemError {
  return new ApiProblemError({
    status: 401,
    title: "Phiên đăng nhập đã hết hạn.",
    detail: "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.",
    code: "SESSION_EXPIRED",
    correlationId,
  });
}

/** Installs browser-only bearer/refresh behavior on a single Axios instance. */
export function installApiAuthInterceptors(
  client: AxiosInstance,
  bridge: ApiAuthBridge,
): () => void {
  let refreshInFlight: Promise<string | undefined> | undefined;
  let invalidationInFlight: Promise<void> | undefined;

  const isBrowser = () => bridge.isBrowser?.() ?? typeof window !== "undefined";
  const invalidate = (): Promise<void> => {
    if (!invalidationInFlight) {
      invalidationInFlight = Promise.resolve(
        bridge.invalidateSession(bridge.getCallbackUrl?.()),
      ).catch(() => undefined);
    }
    return invalidationInFlight;
  };

  const refresh = (): Promise<string | undefined> => {
    if (!refreshInFlight) {
      const request = Promise.resolve(bridge.refreshAccessToken()).finally(() => {
        if (refreshInFlight === request) refreshInFlight = undefined;
      });
      refreshInFlight = request;
    }
    return refreshInFlight;
  };

  const requestId = client.interceptors.request.use(
    async (request) => {
      const config = request as AuthAwareConfig;
      if (!isBrowser() || isAuthEndpoint(config.url)) return config;

      const token = config.__accessTokenOverride ?? await bridge.getAccessToken();
      setAuthorization(config, token);
      return config;
    },
    (error) => Promise.reject(toApiProblemError(error)),
  );

  const responseId = client.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (!axios.isAxiosError(error)) return Promise.reject(toApiProblemError(error));

      const originalProblem = toApiProblemError(error);
      const config = error.config as AuthAwareConfig | undefined;
      const isUnauthorized = error.response?.status === 401;
      const canRefresh = isBrowser()
        && isUnauthorized
        && !!config
        && !config.skipAuthRefresh
        && !isAuthEndpoint(config.url)
        && !config.__authRetried;

      if (!canRefresh) {
        if (isBrowser() && isUnauthorized && config?.__authRetried) {
          await invalidate();
        }
        return Promise.reject(originalProblem);
      }

      config.__authRetried = true;
      let freshToken: string | undefined;
      try {
        freshToken = await refresh();
      } catch {
        await invalidate();
        return Promise.reject(sessionExpiredError(originalProblem.correlationId));
      }

      if (!freshToken) {
        await invalidate();
        return Promise.reject(sessionExpiredError(originalProblem.correlationId));
      }

      // The retry carries an explicit fresh token. The request interceptor must
      // never fall back to a stale session while the provider is re-rendering.
      config.__accessTokenOverride = freshToken;
      setAuthorization(config, freshToken);
      return client.request(config as AxiosRequestConfig);
    },
  );

  return () => {
    client.interceptors.request.eject(requestId);
    client.interceptors.response.eject(responseId);
  };
}
