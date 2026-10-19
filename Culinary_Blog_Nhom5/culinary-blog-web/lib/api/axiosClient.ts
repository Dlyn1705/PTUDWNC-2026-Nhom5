import axios from "axios";
import { getSession } from "next-auth/react";
import { installHttpLogging } from "./httpLogging";
import { installProblemDetails } from "./installProblemDetails";
import { installSessionAuth } from "./sessionAuth";

type ApiEnvironment = {
  API_INTERNAL_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
};

export function resolveApiUrl(
  isServer: boolean,
  environment: ApiEnvironment = process.env as ApiEnvironment,
): string {
  return isServer
    ? environment.API_INTERNAL_URL || environment.NEXT_PUBLIC_API_URL || "http://localhost:5156"
    : environment.NEXT_PUBLIC_API_URL || "http://localhost:5156";
}

export function createBaseApiClient(baseURL: string) {
  return axios.create({
    baseURL,
    withCredentials: true,
    headers: {
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });
}

const API_URL = resolveApiUrl(typeof window === "undefined");

export const axiosClient = createBaseApiClient(API_URL);

if (typeof window !== "undefined") {
  installSessionAuth(axiosClient, () => getSession({ broadcast: false }));
}

installHttpLogging(axiosClient);
installProblemDetails(axiosClient);

export default axiosClient;
