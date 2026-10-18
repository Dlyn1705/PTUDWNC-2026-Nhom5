import axios, { type InternalAxiosRequestConfig } from "axios";
import { installHttpLogging } from "./httpLogging";
import { getSession } from "next-auth/react";

type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _authRefreshAttempt?: boolean;
};

let refreshRequest: Promise<string | undefined> | undefined;

async function refreshAccessToken(): Promise<string | undefined> {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return undefined;

      const session = await getSession();
      return session?.user.accessToken;
    })().finally(() => {
      refreshRequest = undefined;
    });
  }

  return refreshRequest;
}

const API_URL =
  typeof window === "undefined"
    ? process.env.API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:5156"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:5156";

export const axiosClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

// Request Interceptor: Attach bearer token if available
axiosClient.interceptors.request.use(
  async (config) => {
    if (typeof window !== "undefined") {
      const session = await getSession();
      if (session?.user.accessToken) {
        config.headers.Authorization = `Bearer ${session.user.accessToken}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Retry one unauthorized request after a single shared refresh operation.
axiosClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (typeof window === "undefined" || !axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const config = error.config as RetriableRequestConfig | undefined;
    const isAuthRequest = config?.url?.includes("/auth/") ?? false;
    if (
      error.response?.status !== 401 ||
      !config ||
      config._authRefreshAttempt ||
      isAuthRequest
    ) {
      return Promise.reject(error);
    }

    config._authRefreshAttempt = true;
    try {
      const accessToken = await refreshAccessToken();
      if (!accessToken) return Promise.reject(error);

      config.headers.Authorization = `Bearer ${accessToken}`;
      return axiosClient.request(config);
    } catch {
      return Promise.reject(error);
    }
  },
);

installHttpLogging(axiosClient);

export default axiosClient;
