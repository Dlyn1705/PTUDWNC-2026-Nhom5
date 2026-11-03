import { maintenanceNotice } from "@/lib/maintenance";

export function MaintenanceNotice() {
  const notice = maintenanceNotice(process.env.MAINTENANCE_NOTICE_JSON);
  if (!notice) return null;
  return <aside aria-label="Thông báo bảo trì" className="border-b bg-amber-50 px-4 py-3 text-sm text-amber-950">
    <p className="mx-auto max-w-6xl break-words">
      <strong>Bảo trì dự kiến: </strong>{notice.message}{" "}
      <time dateTime={notice.startsAt}>{notice.startsAt.replace("T", " ").replace(".000Z", " UTC")}</time>
      {" – "}<time dateTime={notice.endsAt}>{notice.endsAt.replace("T", " ").replace(".000Z", " UTC")}</time>
    </p>
  </aside>;
}
