export type HealthLevel = "Healthy" | "Degraded" | "Unhealthy";
export type HealthSnapshot = {
  level: HealthLevel;
  readiness: boolean | null;
  dependencies: { database: boolean | null; cache: boolean | null; storage: boolean | null };
  latencyMs: number;
  checkedAt: string;
};

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5156";

async function probe(path: string): Promise<{ ok: boolean; body: unknown } | null> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      cache: "no-store", signal: AbortSignal.timeout(7000),
    });
    const body: unknown = await response.json().catch(() => null);
    return { ok: response.ok, body };
  } catch { return null; }
}

function state(body: unknown, name: string): boolean | null {
  if (!body || typeof body !== "object") return null;
  const dependencies = (body as { dependencies?: unknown }).dependencies;
  if (!dependencies || typeof dependencies !== "object") return null;
  const value = (dependencies as Record<string, unknown>)[name];
  if (value === "Ready") return true;
  if (value === "Unavailable") return false;
  return null;
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const started = performance.now();
  const [live, ready, health] = await Promise.all([
    probe("/health/live"), probe("/health/ready"), probe("/health"),
  ]);
  const checkedAt = new Date().toISOString();
  const latencyMs = Math.max(0, Math.round(performance.now() - started));
  const dependencies = {
    database: state(health?.body, "database"),
    cache: state(health?.body, "cache"),
    storage: state(health?.body, "storage"),
  };
  const readiness = ready ? ready.ok : null;
  const level: HealthLevel = !live?.ok || !ready?.ok || !health?.ok
    || Object.values(dependencies).some(value => value !== true) ? "Unhealthy"
    : latencyMs >= 1500 ? "Degraded" : "Healthy";
  return { level, readiness, dependencies, latencyMs, checkedAt };
}
