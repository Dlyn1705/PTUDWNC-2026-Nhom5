import axios from "axios";
import { installHttpLogging } from "./httpLogging";
import { getSession } from "next-auth/react";
import { installSessionAuth } from "./sessionAuth";

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
  installSessionAuth(axiosClient, () => getSession({ broadcast: false }));
}

installHttpLogging(axiosClient);

export default axiosClient;
