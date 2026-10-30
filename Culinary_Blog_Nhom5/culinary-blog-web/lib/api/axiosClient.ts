import axios from "axios";
import { refreshSession, useAuthStore } from "../../store/authStore";
import { installHttpLogging } from "./httpLogging";
import { installSessionAuth } from "./sessionAuth";
import { toApiProblemError } from "./problemDetails";

const API_URL =
  typeof window === "undefined"
    ? process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5156"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:5156";

export const axiosClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

if (typeof window !== "undefined") {
  installSessionAuth(axiosClient, {
    getToken: () => useAuthStore.getState().accessToken,
    initialize: () => useAuthStore.getState().initialize(),
    refresh: refreshSession,
  });
}

installHttpLogging(axiosClient);
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiProblemError(error)),
);

export default axiosClient;
