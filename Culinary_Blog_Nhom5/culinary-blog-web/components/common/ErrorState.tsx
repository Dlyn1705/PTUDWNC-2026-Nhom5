"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { validCorrelationId } from "@/lib/logger";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  correlationId?: string;
  onRetry?: () => void | Promise<void>;
  isRetrying?: boolean;
  retryLabel?: string;
  className?: string;
  headingLevel?: "h1" | "h2" | "h3" | "h4";
  action?: React.ReactNode;
}

export function ErrorState({
  title = "Không thể tải dữ liệu",
  description = "Đã xảy ra lỗi trong quá trình xử lý. Bạn có thể thử lại sau ít phút.",
  correlationId,
  onRetry,
  isRetrying = false,
  retryLabel = "Thử lại",
  className,
  headingLevel = "h2",
  action,
}: ErrorStateProps) {
  const HeadingTag = headingLevel;
  const safeId = validCorrelationId(correlationId);

  return (
    <div
      role="alert"
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-3xl border border-destructive/20 bg-card p-6 text-center shadow-soft sm:p-8",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </div>

      <HeadingTag className="mt-4 font-display text-xl font-bold text-foreground sm:text-2xl">
        {title}
      </HeadingTag>

      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      {safeId && (
        <p className="mt-3 break-all rounded-lg border border-border bg-muted/50 px-3 py-1 font-mono text-xs text-muted-foreground">
          Mã hỗ trợ: <span className="font-semibold text-foreground">{safeId}</span>
        </p>
      )}

      {(onRetry || action) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <Button
              type="button"
              variant="default"
              onClick={() => {
                if (!isRetrying) {
                  void onRetry();
                }
              }}
              disabled={isRetrying}
              className="gap-2 rounded-xl"
            >
              <RefreshCw
                className={cn("size-4", isRetrying && "animate-spin")}
                aria-hidden="true"
              />
              {isRetrying ? "Đang thử lại…" : retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

export default ErrorState;
