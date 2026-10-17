import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createClient } from "redis";
import type { SessionStore, StoredSession } from "./sessionCoordinator";

const leaseMs = 30_000;
const keyPrefix = "culinary:auth:v1:";
const releaseScript = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
  return 0`;
const writeScript = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
  return 1`;

const redis = createClient({
  url: process.env.AUTH_REDIS_URL ?? "redis://localhost:6379",
  socket: { connectTimeout: 3_000, reconnectStrategy: false },
  disableOfflineQueue: true,
});
// Never log the Redis URL or exception object (they may contain credentials).
redis.on("error", () => console.warn("Authentication session storage is unavailable."));
let connection: Promise<unknown> | undefined;

async function client() {
  if (!redis.isReady) {
    connection ??= redis.connect().finally(() => { connection = undefined; });
    await connection;
  }
  return redis.withCommandOptions({ abortSignal: AbortSignal.timeout(3_000) });
}

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for session encryption.");
  return createHash("sha256").update(`culinary-server-session-v1:${secret}`).digest();
}

function seal(id: string, session: StoredSession): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(id));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function open(id: string, value: string): StoredSession {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as StoredSession;
}

function keys(id: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(id)) throw new Error("Invalid backend session ID.");
  // The hash tag also keeps both Lua keys in the same slot if Redis Cluster is used.
  const key = `${keyPrefix}{${id}}`;
  return { key, lock: `${key}:lock` };
}

export const redisSessionStore: SessionStore = {
  async create(id, session) {
    const { key } = keys(id);
    const result = await (await client()).set(key, seal(id, session), {
      condition: "NX", expiration: { type: "PX", value: Math.max(1, session.refreshTokenExpiry - Date.now()) },
    });
    if (result !== "OK") throw new Error("Could not create authentication session.");
  },

  async withLease(id, action) {
    const { key, lock } = keys(id);
    const owner = randomBytes(24).toString("base64url");
    const deadline = Date.now() + 15_000;
    while (await (await client()).set(lock, owner, {
      condition: "NX", expiration: { type: "PX", value: leaseMs },
    }) !== "OK") {
      if (Date.now() >= deadline) throw new Error("Session refresh is busy.");
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    try {
      return await action({
        async read() {
          const value = await (await client()).get(key);
          return value ? open(id, value) : null;
        },
        async write(session) {
          const result = await (await client()).eval(writeScript, {
            keys: [lock, key],
            arguments: [owner, seal(id, session), String(Math.max(1, session.refreshTokenExpiry - Date.now()))],
          });
          if (result !== 1) throw new Error("Session lease was lost.");
        },
      });
    } finally {
      try {
        await (await client()).eval(releaseScript, { keys: [lock], arguments: [owner] });
      } catch {
        // The lock expires. Its owner check prevents releasing another worker's lease.
      }
    }
  },
};
