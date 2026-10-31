export type HealthLevel = "Healthy" | "Degraded" | "Unavailable";
export type HealthSnapshot = {
  level: HealthLevel;
  dependencies: { database: boolean | null; cache: boolean | null; storage: boolean | null };
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
  const [live, health] = await Promise.all([probe("/health/live"), probe("/health")]);
  const dependencies = {
    database: state(health?.body, "database"),
    cache: state(health?.body, "cache"),
    storage: state(health?.body, "storage"),
  };
  if (!live?.ok) return { level: "Unavailable", dependencies: { database: null, cache: null, storage: null } };
  if (health?.ok && Object.values(dependencies).every((value) => value === true))
    return { level: "Healthy", dependencies };
  return { level: "Degraded", dependencies };
}
