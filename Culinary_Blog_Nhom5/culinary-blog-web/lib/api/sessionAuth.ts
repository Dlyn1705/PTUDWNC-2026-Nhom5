import { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

type ApiSession = {
  error?: string;
  user: { accessToken?: string; accessTokenExpiry?: string };
} | null;
type AuthConfig = InternalAxiosRequestConfig & { authRetried?: boolean; authAccessToken?: string };

const isAuthEndpoint = (url = "") => /\/api\/v1\/auth\/(login|register|refresh|logout|google)(?:[/?]|$)/.test(url);
const usableToken = (session: ApiSession) => !session?.error
  && Date.parse(session?.user.accessTokenExpiry ?? "") > Date.now() ? session?.user.accessToken : undefined;

export function installSessionAuth(client: AxiosInstance, readSession: () => Promise<ApiSession>) {
  let pending: Promise<ApiSession> | undefined;
  function currentSession() {
    pending ??= readSession().finally(() => { pending = undefined; });
    return pending;
  }

  client.interceptors.request.use(async (config: AuthConfig) => {
    if (isAuthEndpoint(config.url)) return config;
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
    const token = usableToken(await currentSession());
    // Auth.js owns refresh; retry only when it supplies a different token, never refresh blindly on 401.
    if (!token || token === config.authAccessToken) throw error;
    config.headers.set("Authorization", `Bearer ${token}`);
    config.authAccessToken = token;
    return client.request(config);
  });
}
