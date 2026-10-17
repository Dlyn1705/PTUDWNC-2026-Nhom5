import axios from "axios";
import {
  forceClientSessionRefresh,
  getClientAccessToken,
  getCurrentCallbackUrl,
  invalidateClientSession,
} from "../auth/clientSessionBridge";
import { installApiAuthInterceptors } from "./axiosAuth";
import { installHttpLogging } from "./httpLogging";

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

// Install logging first so it receives the original Axios response and can keep
// the server correlation ID before API errors are normalized for components.
installHttpLogging(axiosClient);

installApiAuthInterceptors(axiosClient, {
  getAccessToken: getClientAccessToken,
  refreshAccessToken: forceClientSessionRefresh,
  invalidateSession: invalidateClientSession,
  getCallbackUrl: getCurrentCallbackUrl,
});

export default axiosClient;
