export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogEventType = "ClientHttpCompleted" | "ClientHttpError" | "ClientRuntimeError";
export type LogOutcome = "Succeeded" | "Failed" | "Canceled" | "Timeout" | "NetworkError";
export interface ClientLogFields {
  correlationId?: string;
  path?: string;
  method?: string;
  status?: number | null;
  elapsedMs?: number;
  outcome?: LogOutcome;
}

export function validCorrelationId(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(value) ? value : undefined;
}

export function safePath(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, "http://local.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    const path = url.pathname;
    // No query, fragment, credentials, or arbitrary non-HTTP URL is logged.
    return path.startsWith("/") ? path.slice(0, 1024) : undefined;
  } catch { return undefined; }
}

const messages: Record<LogEventType, string> = {
  ClientHttpCompleted: "HTTP request completed",
  ClientHttpError: "HTTP request failed",
  ClientRuntimeError: "Unable to render this page",
};

export function writeLog(level: LogLevel, eventType: LogEventType, fields: ClientLogFields = {}): void {
  if (process.env.NODE_ENV === "production" && (level === "debug" || level === "info")) return;
  const event = {
    timestamp: new Date().toISOString(), level, eventType, message: messages[eventType],
    correlationId: validCorrelationId(fields.correlationId),
    path: safePath(fields.path),
    method: fields.method && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(fields.method)
      ? fields.method.toUpperCase() : undefined,
    status: fields.status === null ? null
      : Number.isInteger(fields.status) && fields.status! >= 100 && fields.status! <= 599 ? fields.status : undefined,
    elapsedMs: typeof fields.elapsedMs === "number" && Number.isFinite(fields.elapsedMs)
      ? Math.max(0, fields.elapsedMs) : undefined,
    outcome: fields.outcome,
  };
  try { console[level](JSON.stringify(event)); } catch { /* Logging must never break the UI. */ }
}

const reported = new WeakSet<object>();
const correlations = new WeakMap<object, string>();

export function rememberHttpError(error: object, correlationId?: string): void {
  reported.add(error);
  if (correlationId) correlations.set(error, correlationId);
}

export function errorCorrelationId(error: object): string | undefined {
  return correlations.get(error);
}

export function reportRuntimeError(error: object, path?: string): void {
  if (reported.has(error)) return;
  reported.add(error);
  writeLog("error", "ClientRuntimeError", { path, correlationId: correlations.get(error), outcome: "Failed" });
}
