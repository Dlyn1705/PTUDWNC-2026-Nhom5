import assert from "node:assert/strict";
import { test } from "node:test";
import axios, { AxiosError } from "axios";
import { type BackendTokens, readBackendTokens, RefreshRejected, RefreshUnavailable } from "../lib/auth/backendTokens";
import { SessionCoordinator, type SessionLease, type SessionStore, type StoredSession } from "../lib/auth/sessionCoordinator";
import { installSessionAuth } from "../lib/api/sessionAuth";

const now = Date.now();
function tokens(refreshToken: string, expiresIn = 900_000): BackendTokens {
  return {
    refreshToken, refreshTokenExpiry: now + 7 * 86_400_000,
    session: { accessToken: `access-${refreshToken}`, accessTokenExpiry: new Date(now + expiresIn).toISOString(),
      user: { id: "user", email: "chef@example.test", displayName: "Chef" }, roles: ["Author"] },
  };
}

class MemoryStore implements SessionStore {
  sessions = new Map<string, StoredSession>();
  private tail = Promise.resolve();
  async create(id: string, value: StoredSession) { this.sessions.set(id, structuredClone(value)); }
  async withLease<T>(id: string, action: (lease: SessionLease) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await action({
        read: async () => structuredClone(this.sessions.get(id) ?? null),
        write: async (value) => { this.sessions.set(id, structuredClone(value)); },
      });
    } finally { release(); }
  }
}

test("fresh access token needs no refresh", async () => {
  const coordinator = new SessionCoordinator(new MemoryStore(), async () => { throw new Error("unexpected"); }, async () => {});
  const id = await coordinator.create(tokens("r0"));
  assert.equal((await coordinator.resolve(id)).refreshToken, "r0");
});

test("concurrent workers and late stale cookies all use a single rotation", async () => {
  const store = new MemoryStore();
  let calls = 0;
  const refresh = async (token: string) => { calls++; assert.equal(token, "r0"); return tokens("r1"); };
  const workers = Array.from({ length: 3 }, () => new SessionCoordinator(store, refresh, async () => {}));
  const id = await workers[0].create(tokens("r0", -1));
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => workers[index % 3].resolve(id)));
  assert.ok(results.every((result) => result.refreshToken === "r1"));
  assert.equal((await workers[1].resolve(id)).refreshToken, "r1");
  assert.equal(calls, 1);
});

test("401/423 closes the session and future calls never replay old refresh token", async () => {
  const store = new MemoryStore();
  let calls = 0;
  let revoked = "";
  const coordinator = new SessionCoordinator(store, async () => { calls++; throw new RefreshRejected(); }, async (token) => { revoked = token; });
  const id = await coordinator.create(tokens("r0", -1));
  await assert.rejects(coordinator.resolve(id), RefreshRejected);
  await assert.rejects(coordinator.resolve(id), RefreshRejected);
  assert.equal(revoked, "r0");
  assert.equal(calls, 1);
});

test("rate limiting retains session with cooldown then rotates successfully", async () => {
  let time = now;
  let calls = 0;
  const coordinator = new SessionCoordinator(new MemoryStore(), async () => {
    if (++calls === 1) throw new RefreshUnavailable(1_000);
    return tokens("r1");
  }, async () => {}, () => time);
  const id = await coordinator.create(tokens("r0", -1));
  await assert.rejects(coordinator.resolve(id), RefreshUnavailable);
  await assert.rejects(coordinator.resolve(id), RefreshUnavailable);
  assert.equal(calls, 1);
  time += 1_001;
  assert.equal((await coordinator.resolve(id)).refreshToken, "r1");
});

test("lost backend response closes session instead of retrying a potentially consumed credential", async () => {
  let calls = 0;
  const coordinator = new SessionCoordinator(new MemoryStore(), async () => { calls++; throw new Error("timeout"); }, async () => {});
  const id = await coordinator.create(tokens("r0", -1));
  await assert.rejects(coordinator.resolve(id), RefreshRejected);
  await assert.rejects(coordinator.resolve(id), RefreshRejected);
  assert.equal(calls, 1);
});

test("worker death after dispatch fails closed for its successor", async () => {
  const store = new MemoryStore();
  const coordinator = new SessionCoordinator(store, async () => { throw new Error("must not dispatch"); }, async () => {});
  const id = await coordinator.create(tokens("r0", -1));
  store.sessions.get(id)!.state = "refreshing";
  await assert.rejects(coordinator.resolve(id), RefreshRejected);
  assert.equal(store.sessions.get(id)!.state, "closed");
});

test("logout racing refresh revokes latest token and stale responses cannot resurrect the session", async () => {
  const store = new MemoryStore();
  let dispatch!: () => void;
  const started = new Promise<void>((resolve) => { dispatch = resolve; });
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  let revoked = "";
  const coordinator = new SessionCoordinator(store, async () => { dispatch(); await waiting; return tokens("r1"); },
    async (token) => { revoked = token; });
  const id = await coordinator.create(tokens("r0", -1));
  const refresh = coordinator.resolve(id);
  await started;
  const logout = coordinator.logout(id);
  finish();
  await Promise.all([refresh, logout]);
  assert.equal(revoked, "r1");
  await assert.rejects(coordinator.resolve(id), RefreshRejected);
});

test("backend refresh requires a new HttpOnly cookie and reads its expiry", async () => {
  const result = tokens("r1");
  const response = new Response(JSON.stringify({ data: result.session, success: true }), { headers: {
    "Set-Cookie": `culinary_refresh_token=r1; expires=${new Date(result.refreshTokenExpiry).toUTCString()}; path=/api/v1/auth; secure; httponly; samesite=lax`,
  } });
  assert.equal((await readBackendTokens(response)).refreshToken, "r1");
  await assert.rejects(readBackendTokens(new Response(JSON.stringify(result.session))));
});

function apiSession(token: string) {
  return { user: { accessToken: token, accessTokenExpiry: new Date(Date.now() + 900_000).toISOString() } };
}

test("API 401 retries only once with a different token", async () => {
  let sends = 0;
  const client = axios.create({ adapter: async (config) => {
    sends++;
    if (sends === 1) throw new AxiosError("unauthorized", "401", config, null, { config, status: 401, statusText: "", headers: {}, data: null });
    assert.equal(config.headers.Authorization, "Bearer new");
    return { config, status: 200, statusText: "", headers: {}, data: "ok" };
  } });
  let reads = 0;
  installSessionAuth(client, async () => apiSession(reads++ === 0 ? "old" : "new"));
  assert.equal((await client.get("/api/v1/recipes/mine")).data, "ok");
  assert.equal(sends, 2);
});

for (const status of [401, 403, 500]) {
  test(`API ${status} with unchanged token does not loop`, async () => {
    let sends = 0;
    const client = axios.create({ adapter: async (config) => {
      sends++;
      throw new AxiosError("rejected", "error", config, null, { config, status, statusText: "", headers: {}, data: null });
    } });
    installSessionAuth(client, async () => apiSession("same"));
    await assert.rejects(client.get("/api/v1/recipes/mine"));
    assert.equal(sends, 1);
  });
}

test("auth endpoints do not invoke session refresh", async () => {
  const client = axios.create({ adapter: async (config) => ({ config, status: 200, statusText: "", headers: {}, data: null }) });
  installSessionAuth(client, async () => { throw new Error("unexpected session read"); });
  await client.post("/api/v1/auth/login", {});
});

test("invalid session cannot send stale bearer token", async () => {
  let sends = 0;
  const client = axios.create({ adapter: async (config) => { sends++; return { config, status: 200, statusText: "", headers: {}, data: null }; } });
  installSessionAuth(client, async () => ({ ...apiSession("stale"), error: "RefreshTokenError" }));
  await assert.rejects(client.get("/api/v1/recipes/mine"));
  assert.equal(sends, 0);
});
