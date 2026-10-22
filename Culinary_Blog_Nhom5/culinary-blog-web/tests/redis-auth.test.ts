import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { createClient } from "redis";
import { redisSessionStore } from "../lib/auth/redisSessionStore";
import { SessionCoordinator } from "../lib/auth/sessionCoordinator";
import type { BackendTokens } from "../lib/auth/backendTokens";

test("shared Redis lease coordinates workers and stores only encrypted token data", { skip: !process.env.AUTH_TEST_REDIS }, async () => {
  // Standalone/CI runs need an ephemeral encryption key, never a production secret.
  process.env.AUTH_SECRET ??= randomBytes(48).toString("base64url");
  const client = createClient({ url: process.env.AUTH_REDIS_URL ?? "redis://localhost:6379" });
  await client.connect();
  const now = Date.now();
  const tokens: BackendTokens = {
    session: { accessToken: "test-access-secret", accessTokenExpiry: new Date(now - 1).toISOString(),
      user: { id: "test-user", email: "test@example.test", displayName: "Test" }, roles: ["Author"] },
    refreshToken: "test-refresh-secret", refreshTokenExpiry: now + 120_000,
  };
  let calls = 0;
  const refresh = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { ...tokens, refreshToken: "rotated-secret", session: { ...tokens.session,
      accessTokenExpiry: new Date(now + 90_000).toISOString() } };
  };
  const workers = Array.from({ length: 3 }, () => new SessionCoordinator(redisSessionStore, refresh, async () => {}));
  const id = await workers[0].create(tokens);
  const key = `culinary:auth:v1:{${id}}`;
  try {
    const value = (await client.get(key))!;
    assert.ok(!value.includes("test-access-secret") && !value.includes("test-refresh-secret"));
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => workers[index % 3].resolve(id)));
    assert.equal(calls, 1);
    assert.ok(results.every((result) => result.refreshToken === "rotated-secret"));
    await workers[0].logout(id);
    await assert.rejects(workers[1].resolve(id));
  } finally {
    await client.del([key, `${key}:lock`]);
    await client.close();
  }
});
