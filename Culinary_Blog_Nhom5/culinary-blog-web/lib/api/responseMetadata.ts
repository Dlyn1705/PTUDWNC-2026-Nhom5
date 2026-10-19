import { AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { validCorrelationId } from "../logger";

export function responseHeader(response: AxiosResponse | undefined, name: string): unknown {
  if (!response) return undefined;
  if (response.headers instanceof AxiosHeaders) return response.headers.get(name);
  return Object.entries(response.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

export function responseCorrelationId(response?: AxiosResponse, config?: InternalAxiosRequestConfig): string | undefined {
  const data: unknown = response?.data;
  const bodyId = data && typeof data === "object" && "correlationId" in data ? data.correlationId : undefined;
  const metadata = (config ?? response?.config) as (InternalAxiosRequestConfig & {
    observability?: { correlationId?: string };
  }) | undefined;
  return validCorrelationId(responseHeader(response, "X-Correlation-ID"))
    ?? validCorrelationId(bodyId) ?? validCorrelationId(metadata?.observability?.correlationId);
}
