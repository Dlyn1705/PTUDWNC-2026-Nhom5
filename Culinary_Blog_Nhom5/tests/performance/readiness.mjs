import { setTimeout } from 'node:timers/promises';

export async function waitForApi(base) {
  const url = new URL('/health/ready', base);
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const ready = response.ok; await response.arrayBuffer();
      if (ready) return;
    } catch { }
    await setTimeout(1000);
  }
  throw new Error(`API readiness timed out: ${url.origin}`);
}
