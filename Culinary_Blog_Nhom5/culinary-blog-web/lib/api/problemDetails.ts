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

const DEFAULT_MESSAGE = "Yêu cầu không thể hoàn tất.";

function fallbackMessage(kind: ApiErrorKind, status?: number): string {
  if (kind === "cancelled") return "Yêu cầu đã bị hủy.";
  if (kind === "request_timeout" || kind === "processing_timeout") return "Máy chủ phản hồi quá lâu. Vui lòng thử lại.";
  if (kind === "network") return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
  if (kind === "invalid_response") return "Máy chủ trả về phản hồi không hợp lệ.";
  if (status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (status === 404) return "Không tìm thấy tài nguyên yêu cầu.";
  if (status === 409) return "Dữ liệu vừa thay đổi hoặc đang bị xung đột.";
  if (status === 422) return "Dữ liệu gửi lên chưa hợp lệ.";
  if (status === 429) return "Bạn thao tác quá nhanh. Vui lòng thử lại sau.";
  if (status && status >= 500) return "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.";
  return DEFAULT_MESSAGE;
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
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;
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
    const status = httpStatus ?? problem.status;
    const kind = options.kind ?? "http";
    super(problem.detail || problem.title || fallbackMessage(kind, status), { cause: options.cause });
    this.name = "ApiProblemError";
    this.type = problem.type;
    this.title = problem.title;
    this.status = status;
    this.detail = problem.detail;
    this.instance = problem.instance;
    this.code = problem.code;
    this.errors = problem.errors ?? {};
    this.correlationId = validCorrelationId(problem.correlationId);
    this.kind = kind;
    this.clientCode = options.clientCode;
    this.retryAfterMs = options.retryAfterMs;
    this.operation = options.operation;
    this.recipeId = options.recipeId;
    this.imageId = options.imageId;
    this.image = options.image;
    this.lastResponse = options.lastResponse;
  }
}

export function isApiProblemError(error: unknown): error is ApiProblemError {
  return error instanceof ApiProblemError
    && error.name === "ApiProblemError"
    && typeof error.errors === "object"
    && error.errors !== null;
}

export function getApiErrorMessage(error: unknown, fallback = DEFAULT_MESSAGE): string {
  if (isApiProblemError(error)) return error.message || error.detail || error.title || fallback;
  if (axios.isAxiosError(error)) return toApiProblemError(error).message || fallback;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function responseProblem(response: AxiosResponse, options: ErrorOptions): ApiProblemError {
  const problem = readProblem(response.data);
  const correlationId = validCorrelationId(problem.correlationId)
    ?? validCorrelationId(responseHeader(response, "x-correlation-id"));
  return new ApiProblemError({ ...problem, correlationId }, response.status, options);
}

export function toApiProblemError(error: unknown, context: ApiErrorContext = {}): ApiProblemError {
  if (isApiProblemError(error)) {
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
    if ((response.data == null && !(context.operation === "upload" && (status === 413 || status === 415)))
      || (typeof response.data === "string" && !problem.detail && !problem.title
        && !(context.operation === "upload" && (status === 413 || status === 415)))) {
      kind = "invalid_response";
    }
  } else if (http && (http.request || http.code === "ERR_NETWORK")) kind = "network";
  else if (error instanceof Error && /network|fetch|connect/i.test(error.message)) kind = "network";

  const correlationId = validCorrelationId(problem.correlationId)
    ?? validCorrelationId(responseHeader(response, "x-correlation-id"))
    ?? validCorrelationId((http?.config as { headers?: Record<string, unknown> } | undefined)?.headers?.["x-correlation-id"])
    ?? responseCorrelationId(response, http?.config);
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
