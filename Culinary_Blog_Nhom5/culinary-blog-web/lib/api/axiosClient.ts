import axios from "axios";
import { getSession, signOut } from "next-auth/react";
import { installHttpLogging } from "./httpLogging";
import { installSessionAuth } from "./sessionAuth";
import { toApiProblemError } from "./problemDetails";

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

if (typeof window !== "undefined") {
  installSessionAuth(
    axiosClient,
    () => getSession({ broadcast: false }) as unknown as Promise<import("./sessionAuth").ApiSession>,
    async (rejectedAccessToken) => {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Requested-With": "culinary-web" },
        body: JSON.stringify({ rejectedAccessToken }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Phiên đăng nhập đã hết hạn.");
      return response.json() as Promise<import("./sessionAuth").ApiSession>;
    },
    async () => {
      const { useAuthStore } = await import("../../store/useAuthStore");
      useAuthStore.getState().clear();
      const callbackUrl = `${window.location.pathname}${window.location.search}`;
      await signOut({ redirectTo: `/auth/login?reason=session-expired&callbackUrl=${encodeURIComponent(callbackUrl)}` });
    },
  );
}

installHttpLogging(axiosClient);

// Register last so session auth gets the first chance to refresh a 401 and
// HTTP logging observes the original transport error before normalization.
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiProblemError(error)),
);

export default axiosClient;
