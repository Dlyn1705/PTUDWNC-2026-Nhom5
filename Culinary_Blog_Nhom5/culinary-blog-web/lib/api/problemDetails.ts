import axios from "axios";

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

const fallbackMessage = "Yêu cầu không thể hoàn tất.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function optionalStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function normalizeErrors(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};

  const normalized: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(value)) {
    if (!Array.isArray(messages)) continue;
    const safeMessages = messages
      .filter((message): message is string => typeof message === "string")
      .map((message) => message.trim())
      .filter(Boolean);
    if (safeMessages.length > 0) normalized[field] = safeMessages;
  }
  return normalized;
}

function validCorrelationId(value: unknown): string | undefined {
  const candidate = optionalString(value);
  return candidate && candidate.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(candidate)
    ? candidate
    : undefined;
}

function responseHeader(headers: unknown, name: string): unknown {
  if (!headers || typeof headers !== "object") return undefined;
  const get = (headers as { get?: (key: string) => unknown }).get;
  if (typeof get === "function") return get.call(headers, name);
  const record = headers as Record<string, unknown>;
  return record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
}

function parseProblem(value: unknown): ProblemDetails {
  if (!isRecord(value)) return {};
  return {
    type: optionalString(value.type),
    title: optionalString(value.title),
    status: optionalStatus(value.status),
    detail: optionalString(value.detail),
    instance: optionalString(value.instance),
    code: optionalString(value.code),
    correlationId: validCorrelationId(value.correlationId),
    errors: normalizeErrors(value.errors),
  };
}

export class ApiProblemError extends Error {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly code?: string;
  readonly errors: Record<string, string[]>;
  readonly correlationId?: string;

  constructor(problem: ProblemDetails, fallbackStatus?: number) {
    const status = problem.status ?? fallbackStatus;
    const detail = optionalString(problem.detail);
    const title = optionalString(problem.title);
    super(detail ?? title ?? fallbackMessage);
    this.name = "ApiProblemError";
    this.type = optionalString(problem.type);
    this.title = title;
    this.status = optionalStatus(status);
    this.detail = detail;
    this.instance = optionalString(problem.instance);
    this.code = optionalString(problem.code);
    this.errors = normalizeErrors(problem.errors);
    this.correlationId = validCorrelationId(problem.correlationId);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isApiProblemError(error: unknown): error is ApiProblemError {
  return error instanceof ApiProblemError;
}

export function getApiErrorMessage(error: unknown, fallback = fallbackMessage): string {
  if (!isApiProblemError(error)) return fallback;
  return error.detail ?? error.title ?? fallback;
}

export function toApiProblemError(error: unknown): ApiProblemError {
  if (isApiProblemError(error)) return error;

  if (!axios.isAxiosError(error)) {
    return new ApiProblemError({ detail: fallbackMessage });
  }

  const responseStatus = optionalStatus(error.response?.status);
  const problem = parseProblem(error.response?.data);
  const correlationId = problem.correlationId
    ?? validCorrelationId(responseHeader(error.response?.headers, "x-correlation-id"));

  if (axios.isCancel(error)) {
    return new ApiProblemError({
      ...problem,
      status: problem.status ?? responseStatus,
      detail: problem.detail ?? "Yêu cầu đã bị hủy.",
      correlationId,
    }, responseStatus);
  }

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return new ApiProblemError({
      ...problem,
      status: problem.status ?? responseStatus,
      detail: problem.detail ?? "Yêu cầu đã hết thời gian chờ.",
      correlationId,
    }, responseStatus);
  }

  if (!error.response) {
    return new ApiProblemError({
      ...problem,
      detail: problem.detail ?? "Không thể kết nối đến máy chủ.",
      correlationId,
    });
  }

  return new ApiProblemError({
    ...problem,
    status: problem.status ?? responseStatus,
    detail: problem.detail,
    correlationId,
  }, responseStatus);
}
