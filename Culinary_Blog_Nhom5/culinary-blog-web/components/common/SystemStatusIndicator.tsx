"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type HealthState = "checking" | "healthy" | "degraded" | "offline";

type HealthReport = {
  status?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5156";

export function SystemStatusIndicator() {
  const [state, setState] = useState<HealthState>("checking");

  const checkHealth = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(new URL("/health", apiBaseUrl), {
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
          : AbortSignal.timeout(8_000),
      });
      const report = await response.json() as HealthReport;
      setState(response.ok && report.status === "Healthy" ? "healthy" : "degraded");
    } catch {
      if (!signal?.aborted) setState("offline");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialCheck = window.setTimeout(() => {
      void checkHealth(controller.signal);
    }, 0);

    const interval = window.setInterval(() => {
      void checkHealth();
    }, 30_000);

    return () => {
      controller.abort();
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [checkHealth]);

  const label = state === "healthy"
    ? "Hệ thống hoạt động"
    : state === "degraded"
      ? "Hệ thống có sự cố"
      : state === "offline"
        ? "Không kết nối máy chủ"
        : "Đang kiểm tra";
  const color = state === "healthy"
    ? "bg-emerald-500"
    : state === "degraded" || state === "offline"
      ? "bg-destructive"
      : "bg-muted-foreground";

  return (
    <Link
      href="/status"
      className="hidden items-center gap-2 rounded-full border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground sm:flex"
      aria-label={`${label}. Mở trang trạng thái hệ thống.`}
      title={label}
    >
      <span className={`size-2 rounded-full ${color} ${state === "checking" ? "animate-pulse" : ""}`} aria-hidden="true" />
      <Activity className="size-3.5 text-primary" aria-hidden="true" />
      <span className="hidden lg:inline">{label}</span>
    </Link>
  );
}
