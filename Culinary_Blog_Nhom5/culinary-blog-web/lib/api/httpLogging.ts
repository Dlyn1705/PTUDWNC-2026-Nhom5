import axios, { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { rememberHttpError, validCorrelationId, writeLog, type LogOutcome } from "../logger";

const header = "X-Correlation-ID";
type RequestMetadata = { correlationId?: string; started: number };
type LoggedConfig = InternalAxiosRequestConfig & { observability?: RequestMetadata };

function createCorrelationId(): string | undefined {
  try {
    const webCrypto = globalThis.crypto;
    if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
    if (typeof webCrypto?.getRandomValues !== "function") return undefined;

    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  } catch {
    // Correlation is best-effort; logging must never prevent the HTTP request.
    return undefined;
  }
}

function responseId(response: AxiosResponse | undefined, fallback?: string): string | undefined {
  return validCorrelationId(response?.headers?.["x-correlation-id"])
    ?? validCorrelationId(response?.data?.correlationId) ?? fallback;
}

function fields(config: LoggedConfig | undefined, response?: AxiosResponse) {
  return {
    correlationId: responseId(response, config?.observability?.correlationId),
    path: config?.url,
    method: config?.method,
    status: response?.status ?? null,
    elapsedMs: config?.observability ? performance.now() - config.observability.started : undefined,
  };
}

/** Returns cleanup for tests/hot reload; install once on the shared API client. */
export function installHttpLogging(client: AxiosInstance): () => void {
  const request = client.interceptors.request.use((config: LoggedConfig) => {
    const correlationId = createCorrelationId();
    if (correlationId) config.headers.set(header, correlationId);
    config.observability = { correlationId, started: performance.now() };
    return config;
  });
  const response = client.interceptors.response.use(
    (response) => {
      writeLog("debug", "ClientHttpCompleted", {
        ...fields(response.config, response), outcome: "Succeeded",
      });
      return response;
    },
    (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const values = fields(error.config, error.response);
        const outcome: LogOutcome = axios.isCancel(error) ? "Canceled"
          : error.code === "ECONNABORTED" || error.code === "ETIMEDOUT" ? "Timeout"
          : error.response ? "Failed" : "NetworkError";
        writeLog(error.response && error.response.status < 500 || outcome === "Canceled" ? "warn" : "error",
          "ClientHttpError", { ...values, outcome });
        rememberHttpError(error, values.correlationId);
      }
      return Promise.reject(error);
    },
  );
  return () => {
    client.interceptors.request.eject(request);
    client.interceptors.response.eject(response);
  };
}
