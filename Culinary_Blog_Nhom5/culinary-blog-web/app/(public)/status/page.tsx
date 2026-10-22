"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, CircleHelp, Clock3, Database, HardDrive, RefreshCw, Server, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type DependencyStatus = "Ready" | "Unavailable" | string;
type HealthReport = {
  status: string;
  timestamp?: string;
  dependencies?: {
    database?: DependencyStatus;
    redis?: DependencyStatus;
    storage?: DependencyStatus;
  };
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5156";

function dependencyLabel(value?: DependencyStatus) {
  if (value === "Ready") return "Sẵn sàng";
  if (value === "Unavailable") return "Không khả dụng";
  return "Chưa có dữ liệu";
}

export default function StatusPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const checkStatus = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    setUnreachable(false);
    const startedAt = performance.now();
    try {
      const response = await fetch(new URL("/health", apiBaseUrl), {
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
          : AbortSignal.timeout(8_000),
      });
      const body = await response.json() as HealthReport;
      setReport(body);
      setLatency(Math.round(performance.now() - startedAt));
      setCheckedAt(new Date());
    } catch {
      if (!signal?.aborted) {
        setUnreachable(true);
        setReport(null);
        setLatency(Math.round(performance.now() - startedAt));
        setCheckedAt(new Date());
      }
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialCheck = window.setTimeout(() => void checkStatus(controller.signal), 0);
    const timer = window.setInterval(() => void checkStatus(), 20_000);
    return () => {
      controller.abort();
      window.clearTimeout(initialCheck);
      window.clearInterval(timer);
    };
  }, [checkStatus]);

  const healthy = report?.status === "Healthy";
  const serviceState = unreachable ? "Không thể kết nối" : healthy ? "Tất cả dịch vụ hoạt động" : report ? "Một số dịch vụ gặp sự cố" : "Đang kiểm tra";
  const statusColor = unreachable || (report && !healthy)
    ? "text-destructive"
    : healthy ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground";

  const dependencies = [
    { key: "database", label: "PostgreSQL", icon: Database },
    { key: "redis", label: "Redis", icon: Server },
    { key: "storage", label: "MinIO Storage", icon: HardDrive },
  ] as const;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-primary hover:underline">← Trang chủ</Link>
      <header className="mb-8 mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
            <Activity className="size-4" aria-hidden="true" /> Trạng thái hệ thống
          </p>
          <h1 className="font-display text-3xl font-bold">Tình trạng hoạt động</h1>
          <p className="mt-2 text-sm text-muted-foreground">Theo dõi kết nối dịch vụ và thời gian phản hồi API.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void checkStatus()} disabled={checking}>
          <RefreshCw className={checking ? "animate-spin" : ""} /> Kiểm tra lại
        </Button>
      </header>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-3">
            {unreachable || (report && !healthy)
              ? <XCircle className={`size-7 ${statusColor}`} aria-hidden="true" />
              : healthy
                ? <CheckCircle2 className={`size-7 ${statusColor}`} aria-hidden="true" />
                : <CircleHelp className="size-7 text-muted-foreground" aria-hidden="true" />}
            <div>
              <h2 className={`font-semibold ${statusColor}`}>{serviceState}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {checkedAt ? `Cập nhật lúc ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(checkedAt)}` : "Đang gửi yêu cầu kiểm tra..."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm">
            <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>{latency === null ? "—" : `${latency} ms`}</span>
          </div>
        </div>

        <div className="grid gap-3 pt-6 sm:grid-cols-3">
          {dependencies.map(({ key, label, icon: Icon }) => {
            const state = report?.dependencies?.[key];
            const ready = state === "Ready";
            const unavailable = state === "Unavailable" || unreachable;
            return (
              <div key={key} className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-muted-foreground" />{label}</span>
                  {ready
                    ? <CheckCircle2 className="size-4 text-emerald-600" aria-label="Sẵn sàng" />
                    : unavailable
                      ? <XCircle className="size-4 text-destructive" aria-label="Không khả dụng" />
                      : <CircleHelp className="size-4 text-muted-foreground" aria-label="Chưa có dữ liệu" />}
                </div>
                <p className={`mt-3 text-sm ${unavailable ? "text-destructive" : ready ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  {unreachable ? "Không kết nối được API" : dependencyLabel(state)}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">Trang tự kiểm tra lại sau mỗi 20 giây. Thời gian phản hồi được đo từ trình duyệt của bạn.</p>
      </section>
    </main>
  );
}
