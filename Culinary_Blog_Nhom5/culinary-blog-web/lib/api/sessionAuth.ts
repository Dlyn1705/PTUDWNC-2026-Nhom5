import { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

export type ApiSession = {
  error?: string;
  user?: { accessToken?: string; accessTokenExpiry?: string };
} | null;
type AuthConfig = InternalAxiosRequestConfig & { authRetried?: boolean; authAccessToken?: string };
type RefreshSession = (rejectedAccessToken: string) => Promise<ApiSession>;

const isAuthEndpoint = (url = "") => /\/api\/v1\/auth\/(login|register|refresh|logout|google)(?:[/?]|$)/.test(url);
const usableToken = (session: ApiSession) => !session?.error
  && Date.parse(session?.user?.accessTokenExpiry ?? "") > Date.now() ? session?.user?.accessToken : undefined;

export function installSessionAuth(
  client: AxiosInstance,
  readSession: () => Promise<ApiSession>,
  refreshSession: RefreshSession = () => readSession(),
  onRefreshFailure?: () => void | Promise<void>,
) {
  let pending: Promise<ApiSession> | undefined;
  let refreshFlight: { promise: Promise<ApiSession> } | undefined;
  function currentSession() {
    if (!pending) {
      const promise = readSession();
      pending = promise;
      const clearLater = () => {
        setTimeout(() => {
          if (pending === promise) pending = undefined;
        }, 500);
      };
      void promise.then(clearLater, clearLater);
    }
    return pending;
  }
  function sessionAfter401(rejectedAccessToken: string) {
    if (!refreshFlight) {
      const promise = refreshSession(rejectedAccessToken).then(async (session) => {
        const token = usableToken(session);
        if (!token || token === rejectedAccessToken) {
          await onRefreshFailure?.();
          throw new Error("Phiên đăng nhập đã hết hạn.");
        }
        return session;
      }, async (error) => {
        await onRefreshFailure?.();
        throw error;
      });
      refreshFlight = { promise };
      // Keep the completed result briefly for the current burst of 401
      // handlers. Axios can schedule response handlers across several turns;
      // this coalesces the actual Auth.js/BFF refresh as well as getSession.
      const clearLater = () => {
        setTimeout(() => {
          if (refreshFlight?.promise === promise) refreshFlight = undefined;
        }, 500);
      };
      void promise.then(clearLater, clearLater);
    }
    return refreshFlight.promise;
  }

  client.interceptors.request.use(async (config: AuthConfig) => {
    if (isAuthEndpoint(config.url)) return config;
    if (config.authRetried && config.authAccessToken) {
      config.headers.set("Authorization", `Bearer ${config.authAccessToken}`);
      return config;
    }
    const session = await currentSession();
    if (session?.error) throw new Error(session.error === "RefreshTokenError"
      ? "Phiên đăng nhập đã hết hạn." : "Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.");
    const token = usableToken(session);
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
      config.authAccessToken = token;
    } else if (config.authAccessToken) {
      config.headers.delete("Authorization");
      delete config.authAccessToken;
    }
    return config;
  });

  client.interceptors.response.use((response) => response, async (error) => {
    const config = error.config as AuthConfig | undefined;
    if (error.response?.status !== 401 || !config?.authAccessToken || config.authRetried
      || isAuthEndpoint(config.url)) throw error;
    config.authRetried = true;
    const token = usableToken(await sessionAfter401(config.authAccessToken));
    // Retry only with the token returned by the forced, single-flight refresh.
    if (!token || token === config.authAccessToken) throw error;
    config.headers.set("Authorization", `Bearer ${token}`);
    config.authAccessToken = token;
    return client.request(config);
  });
}
