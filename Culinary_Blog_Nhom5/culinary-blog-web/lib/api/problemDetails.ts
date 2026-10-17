import axios, { type AxiosError } from "axios";
import { errorCorrelationId, rememberHttpError } from "../logger";

export type ApiProblemErrors = Record<string, string[]>;

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  errors?: ApiProblemErrors;
  correlationId?: string;
}

const fallbackMessage = "Yêu cầu không thể hoàn tất.";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function asErrors(value: unknown): ApiProblemErrors | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const entries = Object.entries(value).flatMap(([field, messages]) => {
    if (!Array.isArray(messages)) return [];
    const normalized = messages.filter((message): message is string => typeof message === "string");
    return normalized.length > 0 ? [[field, normalized] as const] : [];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractProblemDetails(value: unknown): ProblemDetails | undefined {
  if (!isRecord(value)) return undefined;

  const problem: ProblemDetails = {
    type: asString(value.type),
    title: asString(value.title),
    status: asStatus(value.status),
    detail: asString(value.detail),
    instance: asString(value.instance),
    code: asString(value.code),
    errors: asErrors(value.errors),
    correlationId: asString(value.correlationId),
  };

  return Object.values(problem).some((part) => part !== undefined) ? problem : undefined;
}

function readCorrelationHeader(error: AxiosError<unknown>): string | undefined {
  const headers = error.response?.headers as
    | { get?: (name: string) => unknown; [key: string]: unknown }
    | undefined;
  const fromGetter = headers?.get?.("x-correlation-id");
  return asString(fromGetter) ?? asString(headers?.["x-correlation-id"]);
}

function normalizeProblem(problem: ProblemDetails, fallbackStatus?: number): ProblemDetails {
  return {
    type: asString(problem.type),
    title: asString(problem.title),
    status: asStatus(problem.status) ?? asStatus(fallbackStatus),
    detail: asString(problem.detail),
    instance: asString(problem.instance),
    code: asString(problem.code),
    errors: asErrors(problem.errors),
    correlationId: asString(problem.correlationId),
  };
}

export class ApiProblemError extends Error implements ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly code?: string;
  readonly errors: ApiProblemErrors;
  readonly correlationId?: string;

  constructor(problem: ProblemDetails = {}, fallbackStatus?: number) {
    const normalized = normalizeProblem(problem, fallbackStatus);
    super(normalized.detail ?? normalized.title ?? fallbackMessage);
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = "ApiProblemError";
    this.type = normalized.type;
    this.title = normalized.title;
    this.status = normalized.status;
    this.detail = normalized.detail;
    this.instance = normalized.instance;
    this.code = normalized.code;
    this.errors = normalized.errors ?? {};
    this.correlationId = normalized.correlationId;
  }
}

export function isApiProblemError(error: unknown): error is ApiProblemError {
  return error instanceof ApiProblemError;
}

export function getApiErrorMessage(error: unknown): string {
  if (isApiProblemError(error)) {
    return error.detail ?? error.title ?? error.message ?? fallbackMessage;
  }

  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallbackMessage;
}

function networkProblem(error: AxiosError<unknown>): ProblemDetails {
  const isTimeout = error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";
  return {
    title: isTimeout ? "Yêu cầu đã hết thời gian chờ." : "Không thể kết nối đến máy chủ.",
    detail: isTimeout
      ? "Máy chủ phản hồi quá lâu. Vui lòng thử lại."
      : "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại.",
    code: error.code ?? (isTimeout ? "REQUEST_TIMEOUT" : "NETWORK_ERROR"),
  };
}

/**
 * Converts every API/client failure into the shared RFC 7807-shaped contract.
 * It is intentionally idempotent so API modules may safely call it as a boundary.
 */
export function toApiProblemError(error: unknown): ApiProblemError {
  if (isApiProblemError(error)) return error;

  if (!axios.isAxiosError<unknown>(error)) {
    return new ApiProblemError({
      title: "Yêu cầu không thể hoàn tất.",
      detail: error instanceof Error ? error.message : undefined,
      code: error instanceof Error ? "CLIENT_ERROR" : "UNKNOWN_ERROR",
    });
  }

  const responseProblem = extractProblemDetails(error.response?.data);
  const fallbackStatus = error.response?.status;
  const correlationId = responseProblem?.correlationId
    ?? readCorrelationHeader(error)
    ?? errorCorrelationId(error);

  const problem = responseProblem
    ? {
        ...responseProblem,
        status: responseProblem.status ?? fallbackStatus,
        correlationId,
      }
    : error.response
      ? {
          status: fallbackStatus,
          title: "Máy chủ không thể xử lý yêu cầu.",
          detail: error.response.data == null || error.response.data === ""
            ? "Máy chủ không trả về thông tin lỗi."
            : "Máy chủ trả về phản hồi lỗi không hợp lệ.",
          code: "UNEXPECTED_API_RESPONSE",
          correlationId,
        }
      : {
          ...networkProblem(error),
          correlationId,
        };

  const normalized = new ApiProblemError(problem, fallbackStatus);
  rememberHttpError(normalized, normalized.correlationId ?? correlationId);
  return normalized;
}
