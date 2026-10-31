"use client";

import { useQuery } from "@tanstack/react-query";
import { SiteShell } from "@/components/layout/SiteShell";
import { getHealthSnapshot, type HealthLevel } from "@/lib/api/healthApi";

const details: Record<HealthLevel, string> = {
  Healthy: "Các dịch vụ đang hoạt động bình thường.",
  Degraded: "Một số dịch vụ đang gặp sự cố. Bạn có thể thử lại sau.",
  Unhealthy: "Hệ thống hiện chưa sẵn sàng. Vui lòng thử lại sau.",
};
const badge: Record<HealthLevel, string> = {
  Healthy: "bg-success text-success-foreground border-success",
  Degraded: "bg-warning text-warning-foreground border-warning",
  Unhealthy: "bg-destructive text-destructive-foreground border-destructive",
};

export default function StatusPage() {
  const health = useQuery({ queryKey: ["public-health"], queryFn: getHealthSnapshot,
    retry: false, refetchInterval: 60_000 });
  const snapshot = health.data;
  const level = snapshot?.level ?? "Unhealthy";
  return <SiteShell><div className="page-container max-w-3xl space-y-6 py-10">
    <h1 className="font-display text-3xl font-bold">Trạng thái hệ thống</h1>
    {health.isPending ? <p role="status">Đang kiểm tra trạng thái…</p> : <>
      <section aria-live="polite" className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">Tổng quát: <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${badge[level]}`}>{level}</span></h2>
        <p className="mt-2 text-muted-foreground">{details[level]}</p>
      </section>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border p-5"><dt className="font-semibold">Readiness</dt>
          <dd className="mt-2">{snapshot?.readiness === true ? "Sẵn sàng" : snapshot?.readiness === false ? "Chưa sẵn sàng" : "Chưa xác định"}</dd></div>
        <div className="rounded-2xl border border-border p-5"><dt className="font-semibold">Thời gian phản hồi</dt>
          <dd className="mt-2">{snapshot ? `${snapshot.latencyMs} ms` : "Chưa xác định"}</dd></div>
        <div className="rounded-2xl border border-border p-5"><dt className="font-semibold">Kiểm tra gần nhất</dt>
          <dd className="mt-2">{snapshot ? new Date(snapshot.checkedAt).toLocaleString("vi-VN") : "Chưa xác định"}</dd></div>
      </dl>
      <dl className="grid gap-3 sm:grid-cols-3">
        {(["database", "cache", "storage"] as const).map((key) => <div key={key} className="rounded-2xl border border-border p-5">
          <dt className="font-semibold">{key === "database" ? "Database" : key === "cache" ? "Cache" : "Storage"}</dt>
          <dd className="mt-2">{snapshot?.dependencies[key] === true ? "Sẵn sàng" :
            snapshot?.dependencies[key] === false ? "Tạm gián đoạn" : "Chưa xác định"}</dd>
        </div>)}
      </dl>
      <button type="button" className="submit-button" disabled={health.isFetching} onClick={() => health.refetch()}>
        {health.isFetching ? "Đang kiểm tra…" : "Kiểm tra lại"}</button>
    </>}
  </div></SiteShell>;
}
