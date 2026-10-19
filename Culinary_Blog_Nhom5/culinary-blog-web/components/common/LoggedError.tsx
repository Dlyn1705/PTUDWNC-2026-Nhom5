"use client";

import { useEffect } from "react";
import { errorCorrelationId, reportRuntimeError } from "@/lib/logger";
import { ErrorState } from "./ErrorState";

export function useErrorLog(error: Error): void {
  useEffect(() => {
    reportRuntimeError(error, window.location.pathname);
  }, [error]);
}

export interface LoggedErrorProps {
  error: Error & { correlationId?: string; digest?: string };
  retry?: () => void;
  reset?: () => void;
  title?: string;
  description?: string;
}

export default function LoggedError({
  error,
  retry,
  reset,
  title = "Không thể tải trang",
  description = "Đã xảy ra lỗi trong quá trình tải trang. Bạn có thể thử lại sau ít phút.",
}: LoggedErrorProps) {
  useErrorLog(error);
  const correlationId = errorCorrelationId(error) || error.correlationId;
  const handleRetry = retry ?? reset;
  const isServerApiError = error.name === "ServerApiError";
  const visibleDescription = isServerApiError && error.message ? error.message : description;

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center px-4 py-16">
      <ErrorState
        title={title}
        description={visibleDescription}
        correlationId={correlationId}
        onRetry={handleRetry}
        headingLevel="h1"
      />
    </main>
  );
}
