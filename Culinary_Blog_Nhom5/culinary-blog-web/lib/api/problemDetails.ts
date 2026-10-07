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

export class ApiProblemError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly errors: Record<string, string[]>;
  readonly correlationId?: string;

  constructor(problem: ProblemDetails, fallbackStatus?: number) {
    super(problem.detail || problem.title || "Yêu cầu không thể hoàn tất.");
    this.name = "ApiProblemError";
    this.status = problem.status ?? fallbackStatus;
    this.code = problem.code;
    this.errors = problem.errors ?? {};
    this.correlationId = problem.correlationId;
  }
}

export function toApiProblemError(error: unknown): Error {
  if (!axios.isAxiosError<ProblemDetails>(error)) {
    return error instanceof Error ? error : new Error("Yêu cầu không thể hoàn tất.");
  }

  if (error.response?.data && typeof error.response.data === "object") {
    return new ApiProblemError(error.response.data, error.response.status);
  }

  return new ApiProblemError(
    {
      status: error.response?.status,
      detail: error.message,
    },
    error.response?.status,
  );
}
