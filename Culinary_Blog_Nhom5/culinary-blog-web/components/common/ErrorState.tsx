"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { focusMainContent } from "@/lib/focus";
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
  focusOnMount?: boolean;
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
  focusOnMount = false,
}: ErrorStateProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const startedRetry = useRef(false);
  useEffect(() => { if (focusOnMount) headingRef.current?.focus(); }, [focusOnMount]);
  useEffect(() => () => {
    if (!startedRetry.current) return;
    // Only restore focus if the user's recovery action removed the focused UI.
    requestAnimationFrame(() => { if (document.activeElement === document.body) focusMainContent(); });
  }, []);
  const HeadingTag = headingLevel;
  const safeId = validCorrelationId(correlationId);
  const retryInFlight = useRef(false);
  const [localPending, setLocalPending] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const pending = isRetrying || localPending;

  async function retry() {
    if (!onRetry || pending || retryInFlight.current) return;
    retryInFlight.current = true;
    startedRetry.current = true;
    setLocalPending(true);
    setRetryFailed(false);
    try {
      await onRetry();
    } catch {
      // Keep the recovery UI usable without displaying a raw exception.
      startedRetry.current = false;
      setRetryFailed(true);
    } finally {
      retryInFlight.current = false;
      setLocalPending(false);
    }
  }

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-3xl border border-destructive/20 bg-card p-6 text-center shadow-soft sm:p-8",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </div>

      <div role="alert">
      <HeadingTag ref={headingRef} tabIndex={-1} className="mt-4 font-display text-xl font-bold text-foreground sm:text-2xl">
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

      {retryFailed && <p className="mt-3 text-sm">Chưa thể tải lại. Vui lòng thử lại sau ít phút.</p>}
      </div>
      <p role="status" className="sr-only">{pending ? "Đang thử tải lại nội dung…" : ""}</p>
      {(onRetry || action) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <Button
              type="button"
              variant="default"
              onClick={() => void retry()}
              aria-disabled={pending}
              className="gap-2 rounded-xl"
            >
              <RefreshCw
                className={cn("size-4", pending && "animate-spin motion-reduce:animate-none")}
                aria-hidden="true"
              />
              {pending ? "Đang thử lại…" : retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

export default ErrorState;
