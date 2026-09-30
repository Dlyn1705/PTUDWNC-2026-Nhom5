import axios from "axios";

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
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("accessToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export default axiosClient;
