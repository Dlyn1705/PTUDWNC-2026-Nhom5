import axios from "axios";
import { installHttpLogging } from "./httpLogging";
import { getSession } from "next-auth/react";

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

// Response Interceptor
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  },
);

installHttpLogging(axiosClient);

export default axiosClient;
