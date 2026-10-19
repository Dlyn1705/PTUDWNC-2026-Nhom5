import axios, { type AxiosResponse } from "axios";
import { rememberHttpError, validCorrelationId } from "../logger";
import { responseCorrelationId, responseHeader } from "./responseMetadata";
import type { StoredRecipeImage } from "../../types/recipe-management.types";

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  correlationId?: string;
  errors?: Record<string, string[]>;
}

export type ApiErrorKind = "cancelled" | "request_timeout" | "processing_timeout" | "file_validation"
  | "validation" | "network" | "image_processing" | "http" | "invalid_response" | "unknown";
export interface ApiErrorContext {
  operation?: "upload" | "poll" | "list" | "delete" | "set_primary";
  recipeId?: string;
  imageId?: string;
  image?: StoredRecipeImage;
  lastResponse?: { status: number; correlationId?: string };
}
interface ErrorOptions extends ApiErrorContext {
  kind?: ApiErrorKind;
  clientCode?: string;
  cause?: unknown;
  retryAfterMs?: number;
}

export function readProblem(value: unknown): ProblemDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: ProblemDetails = {};
  for (const key of ["type", "title", "detail", "instance", "code", "correlationId"] as const) {
    if (typeof source[key] === "string") result[key] = source[key];
  }
  if (Number.isInteger(source.status) && Number(source.status) >= 100 && Number(source.status) <= 599) {
    result.status = Number(source.status);
  }
  if (source.errors && typeof source.errors === "object" && !Array.isArray(source.errors)) {
    result.errors = Object.fromEntries(Object.entries(source.errors).filter((entry): entry is [string, string[]] =>
      Array.isArray(entry[1]) && entry[1].every(item => typeof item === "string")));
  }
  return result;
}

export class ApiProblemError extends Error implements ApiErrorContext {
  readonly status?: number;
  readonly code?: string;
  readonly errors: Record<string, string[]>;
  readonly correlationId?: string;
  readonly kind: ApiErrorKind;
  readonly clientCode?: string;
  readonly retryAfterMs?: number;
  operation?: ApiErrorContext["operation"];
  recipeId?: string;
  imageId?: string;
  image?: StoredRecipeImage;
  lastResponse?: ApiErrorContext["lastResponse"];

  constructor(problem: ProblemDetails, httpStatus?: number, options: ErrorOptions = {}) {
    super(problem.detail || problem.title || "Yêu cầu không thể hoàn tất.", { cause: options.cause });
    this.name = "ApiProblemError";
    this.status = httpStatus ?? problem.status;
    this.code = problem.code;
    this.errors = problem.errors ?? {};
    this.correlationId = validCorrelationId(problem.correlationId);
    this.kind = options.kind ?? "http";
    this.clientCode = options.clientCode;
    this.retryAfterMs = options.retryAfterMs;
    this.operation = options.operation;
    this.recipeId = options.recipeId;
    this.imageId = options.imageId;
    this.image = options.image;
    this.lastResponse = options.lastResponse;
  }
}

export function responseProblem(response: AxiosResponse, options: ErrorOptions): ApiProblemError {
  const problem = readProblem(response.data);
  return new ApiProblemError({ ...problem, correlationId: responseCorrelationId(response) }, response.status, options);
}

export function toApiProblemError(error: unknown, context: ApiErrorContext = {}): ApiProblemError {
  if (error instanceof ApiProblemError) {
    error.operation ??= context.operation;
    error.recipeId ??= context.recipeId;
    error.imageId ??= context.imageId;
    error.image ??= context.image;
    error.lastResponse ??= context.lastResponse;
    return error;
  }
  const http = axios.isAxiosError(error) ? error : undefined;
  const response = http?.response;
  const problem = readProblem(response?.data);
  const status = response?.status;
  let kind: ApiErrorKind = "unknown";
  if (axios.isCancel(error) || http?.code === "ERR_CANCELED"
    || (error instanceof Error && error.name === "AbortError")) kind = "cancelled";
  else if (http?.code === "ECONNABORTED" || http?.code === "ETIMEDOUT") kind = "request_timeout";
  else if (response) {
    kind = "http";
    if (status === 400 || status === 422) {
      if (Object.keys(problem.errors ?? {}).length) kind = "validation";
      if (context.operation === "upload" && Object.keys(problem.errors ?? {}).some(key =>
        /^(file|length|contenttype|filename)(\.|$)/i.test(key))) kind = "file_validation";
    }
    if (context.operation === "upload" && (status === 413 || status === 415)) kind = "file_validation";
  } else if (http && (http.request || http.code === "ERR_NETWORK")) kind = "network";

  const correlationId = responseCorrelationId(response, http?.config);
  const retryAfter = responseHeader(response, "Retry-After");
  let retryAfterMs: number | undefined;
  if (typeof retryAfter === "string") {
    const parsed = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(parsed)) retryAfterMs = Math.max(0, parsed);
  }
  const normalized = new ApiProblemError({ ...problem, correlationId }, status, {
    ...context, kind, cause: error, retryAfterMs,
  });
  if (http) rememberHttpError(normalized, correlationId);
  return normalized;
}
