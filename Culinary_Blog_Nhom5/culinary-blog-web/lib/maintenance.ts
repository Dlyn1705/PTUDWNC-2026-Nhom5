export type MaintenanceNotice = { startsAt: string; endsAt: string; message: string };

// Server-only environment input; an invalid notice cannot announce late maintenance.
export function maintenanceNotice(raw: string | undefined, now = Date.now()): MaintenanceNotice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const announced = Date.parse(value.announcedAt);
    const starts = Date.parse(value.startsAt);
    const ends = Date.parse(value.endsAt);
    if (![announced, starts, ends].every(Number.isFinite) || starts - announced < 48 * 3600000 ||
        announced > now || ends <= starts || ends <= now || typeof value.message !== "string" ||
        !value.message.trim() || value.message.length > 500) return null;
    return { startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString(), message: value.message.trim() };
  } catch { return null; }
}
