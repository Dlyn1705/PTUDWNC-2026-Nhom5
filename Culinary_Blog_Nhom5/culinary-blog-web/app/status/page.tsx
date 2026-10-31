"use client";

import { useQuery } from "@tanstack/react-query";
import { SiteShell } from "@/components/layout/SiteShell";
import { getHealthSnapshot } from "@/lib/api/healthApi";

const labels = { Healthy: "Healthy", Degraded: "Degraded", Unavailable: "Unavailable" };
const details = {
  Healthy: "Các dịch vụ đang hoạt động bình thường.",
  Degraded: "Một số dịch vụ đang gặp sự cố. Bạn vẫn có thể thử lại sau.",
  Unavailable: "Hệ thống hiện không phản hồi. Vui lòng thử lại sau.",
};

export default function StatusPage() {
  const health = useQuery({ queryKey: ["public-health"], queryFn: getHealthSnapshot,
    retry: false, refetchInterval: 60_000 });
  return <SiteShell><div className="page-container max-w-3xl space-y-6 py-10">
    <h1 className="font-display text-3xl font-bold">Trạng thái hệ thống</h1>
    {health.isPending ? <p role="status">Đang kiểm tra trạng thái…</p> : <>
      <section aria-live="polite" className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold">Tổng quát: {labels[health.data?.level ?? "Unavailable"]}</h2>
        <p className="mt-2 text-muted-foreground">{details[health.data?.level ?? "Unavailable"]}</p>
      </section>
      <dl className="grid gap-3 sm:grid-cols-3">
        {(["database", "cache", "storage"] as const).map((key) => <div key={key} className="rounded-2xl border border-border p-5">
          <dt className="font-semibold">{key === "database" ? "Database" : key === "cache" ? "Cache" : "Storage"}</dt>
          <dd className="mt-2">{health.data?.dependencies[key] === true ? "Sẵn sàng" :
            health.data?.dependencies[key] === false ? "Tạm gián đoạn" : "Chưa xác định"}</dd>
        </div>)}
      </dl>
      <button type="button" className="submit-button" disabled={health.isFetching} onClick={() => health.refetch()}>
        {health.isFetching ? "Đang kiểm tra…" : "Kiểm tra lại"}</button>
    </>}
  </div></SiteShell>;
}
